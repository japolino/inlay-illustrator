import { describe, expect, test } from "bun:test";
import { normalizeConfig, type InlayConfig } from "../../shared/contract/index.js";
import { createFakeHost } from "../testing/fake-host.js";
import {
  applyPrefixPreparation,
  CAPABILITY_RETRY_MS,
  createLlmService,
  declaredVisionSupport,
  engineAnalysisConfig,
  extractText,
  httpStatusOf,
  jsonModeParameters,
  mergeLeadingSystemMessages,
  omitsTemperature,
  prefixPreparationModel,
  prefixPreparedMessages,
  supportsJsonMode,
  unsupportedVisionError,
} from "./llm.js";

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
  test("json mode support and temperature omission", () => {
    expect(supportsJsonMode("openai", "gpt-4o")).toBe(true);
    expect(supportsJsonMode("anthropic", "claude-3")).toBe(false);
    expect(supportsJsonMode("custom", "deepseek-chat")).toBe(true);
    expect(supportsJsonMode("custom", "qwen3-32b")).toBe(true);
    expect(omitsTemperature("claude-opus-5")).toBe(true);
    expect(omitsTemperature("anthropic/claude-sonnet-5-20261001")).toBe(true);
    expect(omitsTemperature("gemini-3.5-flash")).toBe(true);
    expect(omitsTemperature("gemini-2.5-flash")).toBe(false);
    expect(omitsTemperature("gpt-5.6-luna")).toBe(false);
  });

  test("temperature omission follows AM 0.9.91 (rYe with Haiku 5, jW/kD_91 Gemini 4, OpenAI-format mandatory reasoning)", () => {
    // rYe @88735: Haiku 5 joins Sonnet/Opus 5.
    expect(omitsTemperature("claude-haiku-5")).toBe(true);
    expect(omitsTemperature("claude-haiku-5-5")).toBe(true);
    expect(omitsTemperature("claude-haiku-4-5")).toBe(false);
    // kD_91 @5651 (exact names, any case) and lJ_91 @5654 (google/ prefix).
    for (const m of ["gemini-4-argon", "gemini-4-carbon", "gemini-4-hydrogen", "google/gemini-4-hydrogen", "Gemini-4-Argon"]) expect(omitsTemperature(m)).toBe(true);
    expect(omitsTemperature("gemini-4-argon-preview")).toBe(false);
    expect(omitsTemperature("gemini-4-neon")).toBe(false);
    expect(omitsTemperature("gemini-4-hydrogen-0601")).toBe(false);
    // _S `mandatory` (new in the OpenAI-format bodies): only off Anthropic and native Google connections.
    for (const m of ["gpt-5", "gpt-5-mini", "gpt-5-2025-08-07", "o3-mini", "o1", "gpt-6", "gpt-6.2", "openai/gpt-oss-120b", "gpt-oss:20b", "gemini-2.5-pro", "glm-5.3", "openai/gpt-5"]) {
      expect([m, omitsTemperature(m, "openai")]).toEqual([m, true]);
    }
    for (const m of ["gpt-6-sol", "gpt-6-luna-mini", "gpt-6.1-terra", "gpt-5.6-luna", "gpt-5.1", "gpt-4o", "glm-5.2", "gemini-2.5-flash", "o2"]) {
      expect([m, omitsTemperature(m, "openrouter")]).toEqual([m, false]);
    }
    expect(omitsTemperature("gpt-5", "anthropic")).toBe(false);
    expect(omitsTemperature("gemini-2.5-pro", "google")).toBe(false);
    expect(omitsTemperature("gpt-5")).toBe(true);
  });

  test("engine analyzer config: only Gemini 4 Argon on a Vertex connection gets the vertex_ai / gemini-4-argon pair (AM c0e, 0.9.91)", () => {
    const analysis = { connectionId: "vx", model: "", temperature: 0.4 };
    for (const model of ["gemini-4-argon", "Gemini-4-Argon ", "google/gemini-4-argon", "publishers/google/models/gemini-4-argon"]) {
      expect<unknown>([model, engineAnalysisConfig(analysis, { provider: "google_vertex", model })]).toEqual([model, { ...analysis, provider: "vertex_ai", model: "gemini-4-argon" }]);
    }
    const unchanged: Array<[string, string]> = [
      ["google_vertex", "gemini-4-carbon"],
      ["google_vertex", "gemini-4-hydrogen"],
      ["google_vertex", "gemini-4-argon-0601"],
      ["google_vertex", ""],
      ["google", "gemini-4-argon"],
      ["openrouter", "google/gemini-4-argon"],
      ["ollama_local", "gemini-4-argon"],
    ];
    for (const [provider, model] of unchanged) expect([provider, model, engineAnalysisConfig(analysis, { provider, model })]).toEqual([provider, model, analysis]);
    expect(engineAnalysisConfig(analysis, null)).toBe(analysis);
    expect(analysis).toEqual({ connectionId: "vx", model: "", temperature: 0.4 });
  });

  test("http status, vision metadata and errors, text extraction", () => {
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

  test("analyzerTarget: the connection's provider with the settings model, else the connection's model; a missing connection rejects", async () => {
    const { llm, setConfig } = setup();
    expect(await llm.analyzerTarget()).toEqual({ provider: "openai", model: "gpt-x" });
    expect(await llm.analyzerTarget({ connectionId: "cl", model: "claude-y" })).toEqual({ provider: "anthropic", model: "claude-y" });
    setConfig({ analysis: { connectionId: "cl" } });
    expect(await llm.analyzerTarget()).toEqual({ provider: "anthropic", model: "claude-x" });
    await expect(llm.analyzerTarget({ connectionId: "gone" })).rejects.toMatchObject({ error: { detailCode: "ANALYZER_CONNECTION_MISSING" } });
  });

  test("JSON mode goes to Google and Vertex connections as responseMimeType, to every other provider as response_format", async () => {
    expect(jsonModeParameters("google_vertex")).toEqual({ responseMimeType: "application/json" });
    expect(jsonModeParameters(" Google ")).toEqual({ responseMimeType: "application/json" });
    for (const provider of ["openai", "openrouter", "custom", "deepseek", ""]) expect([provider, jsonModeParameters(provider)]).toEqual([provider, { response_format: { type: "json_object" } }]);
    const parametersFor = async (provider: string, analysis: Record<string, unknown> = {}) => {
      const { fake, llm } = setup({ analysis: { connectionId: "g", ...analysis } });
      fake.llmConnections.push({ id: "g", name: "G", provider, api_url: "", model: "gemini-4-carbon", preset_id: null, is_default: false, has_api_key: true, metadata: {}, reasoning_bindings: null, created_at: 0, updated_at: 0 });
      fake.scriptLlm({ content: "{}" });
      const result = await llm.complete({ purpose: "t", messages: [{ role: "user", content: "hi" }], responseMode: "json" });
      return { jsonMode: result.jsonMode, parameters: fake.generateCalls[0]!.input.parameters as Record<string, unknown> };
    };
    for (const provider of ["google_vertex", "google"]) {
      const sent = await parametersFor(provider);
      expect([provider, sent.jsonMode, sent.parameters.responseMimeType, sent.parameters.response_format]).toEqual([provider, true, "application/json", undefined]);
    }
    const openrouter = await parametersFor("openrouter");
    expect([openrouter.parameters.responseMimeType, openrouter.parameters.response_format]).toEqual([undefined, { type: "json_object" }]);
    const off = await parametersFor("google_vertex", { jsonMode: false });
    expect([off.jsonMode, off.parameters.responseMimeType, off.parameters.response_format]).toEqual([false, undefined, undefined]);
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
    fake.scriptLlm(new Error("failed (503): overloaded"), new TypeError("fetch failed"), { content: "not json" });
    const retries: number[] = [];
    await expect(llm.complete({ purpose: "t", messages: [], responseMode: "json" }, { onRetry: (i) => retries.push(i.attempt) })).rejects.toMatchObject({ error: { code: "provider-error", detailCode: "ANALYZER_JSON_PARSE", retryable: false } });
    expect(fake.generateCalls).toHaveLength(3);
    expect(sleeps).toEqual([100, 100]);
    expect(retries).toEqual([1, 2]);
    fake.scriptLlm(new Error("failed (401): bad key"));
    await expect(llm.complete({ purpose: "t", messages: [], responseMode: "json" })).rejects.toMatchObject({ error: { code: "permission-denied", detailCode: "ANALYZER_HTTP" } });
    expect(fake.generateCalls).toHaveLength(4);
  });

  test("content errors are not retried (AM 0.9.90 `Not`): empty response and JSON parse fail after one attempt", async () => {
    const { fake, llm, sleeps } = setup({ runtime: { generationAutoRetryCount: 3 } });
    fake.scriptLlm({ content: "" });
    await expect(llm.complete({ purpose: "t", messages: [], responseMode: "json" })).rejects.toMatchObject({ error: { detailCode: "ANALYZER_EMPTY_RESPONSE", retryable: false } });
    expect(fake.generateCalls).toHaveLength(1);
    fake.scriptLlm({ content: "not json" });
    await expect(llm.complete({ purpose: "t", messages: [], responseMode: "json" })).rejects.toMatchObject({ error: { detailCode: "ANALYZER_JSON_PARSE", retryable: false } });
    expect(fake.generateCalls).toHaveLength(2);
    expect(sleeps).toEqual([]);
    fake.scriptLlm(new Error("failed (503): overloaded"), { content: '{"ok":1}' });
    expect(await llm.complete({ purpose: "t", messages: [], responseMode: "json" })).toMatchObject({ parsed: { ok: 1 }, attempts: 2 });
  });

  test("an empty reply cut off by length is an empty response and is not retried (AM checks the finish reason only for DeepSeek)", async () => {
    const { fake, llm } = setup({ runtime: { generationAutoRetryCount: 1 } });
    fake.scriptLlm({ content: "", finish_reason: "length" });
    await expect(llm.complete({ purpose: "t", messages: [], responseMode: "json" })).rejects.toMatchObject({ error: { detailCode: "ANALYZER_EMPTY_RESPONSE" } });
    expect(fake.generateCalls).toHaveLength(1);
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

  test("vision: a format/MIME rejection drops only those images for that request and does not mark the model text-only", async () => {
    const { fake, llm } = setup();
    const img = (mime: string) => ({ type: "image" as const, data: "AAAA", mime_type: mime });
    const messages = [{ role: "user" as const, content: [{ type: "text" as const, text: "look" }, img("image/gif"), img("image/png")] }];
    fake.scriptLlm(new Error("Google generate failed (400): Unsupported MIME type: image/gif"), { content: "{}" });
    const r = await llm.complete({ purpose: "t", messages, responseMode: "json", visionFallback: "fail", retries: 0 });
    expect(r.imagesDropped).toBe(true);
    expect((fake.generateCalls[1]!.input.messages as Array<{ content: Array<{ mime_type?: string }> }>)[0]!.content.map((p) => p.mime_type ?? "text")).toEqual(["text", "image/png"]);
    expect(await llm.supportsVision()).toBe(true);
    // The OpenAI wording lists the allowed formats: the non-PNG/JPEG images go.
    fake.scriptLlm(new Error("OpenAI generate failed (400): You uploaded an unsupported image. Please make sure your image has of one the following formats: ['png', 'jpeg']."), { content: "{}" });
    await llm.complete({ purpose: "t", messages: [{ role: "user", content: [img("image/avif"), img("image/jpeg")] }], responseMode: "json", retries: 0 });
    expect((fake.generateCalls[3]!.input.messages as Array<{ content: Array<{ mime_type?: string }> }>)[0]!.content.map((p) => p.mime_type)).toEqual(["image/jpeg"]);
    expect(await llm.supportsVision()).toBe(true);
    // Images go out again on the next request.
    fake.scriptLlm({ content: "{}" });
    expect((await llm.complete({ purpose: "t", messages, responseMode: "json" })).imagesDropped).toBe(false);
  });

  test("vision: a remembered 'no vision' is tried again after CAPABILITY_RETRY_MS", async () => {
    const fake = createFakeHost();
    fake.llmConnections.push({ id: "oa", name: "OpenAI", provider: "openai", api_url: "", model: "gpt-x", preset_id: null, is_default: true, has_api_key: true, metadata: {}, reasoning_bindings: null, created_at: 0, updated_at: 0 });
    let clock = 0;
    const llm = createLlmService({ host: fake.host, userId: fake.userId, loadConfig: async () => normalizeConfig({}), now: () => clock });
    const messages = [{ role: "user" as const, content: [{ type: "text" as const, text: "look" }, { type: "image" as const, data: "AAAA", mime_type: "image/png" }] }];
    fake.scriptLlm(new Error("failed (400): image input is not supported for this model"), { content: "{}" });
    await llm.complete({ purpose: "t", messages, responseMode: "json" });
    expect(await llm.supportsVision()).toBe(false);
    clock = CAPABILITY_RETRY_MS - 1;
    expect(await llm.supportsVision()).toBe(false);
    clock = CAPABILITY_RETRY_MS;
    expect(await llm.supportsVision()).toBe(true);
    fake.scriptLlm({ content: "{}" });
    expect((await llm.complete({ purpose: "t", messages, responseMode: "json" })).imagesDropped).toBe(false);
  });

  test("a partitioned request rejected with a 400 is resent flat once, and flat is remembered only when it works", async () => {
    const { fake, llm } = setup({ analysis: { jsonMode: false } });
    const flat = [{ role: "system" as const, content: "SYS" }, { role: "user" as const, content: "LIVE+STATIC" }];
    const partitionShape = { cacheSegments: [{ messages: [{ role: "system", content: "SYS" }] }, { messages: [{ role: "user", content: "STATIC" }] }], liveMessages: [{ role: "user", content: "LIVE" }] };
    fake.scriptLlm(new Error("failed (400): Conversation roles must alternate user/assistant/user/assistant"), new Error("failed (400): still bad"));
    await expect(llm.analyzerClient().complete({}, flat, { cachePartition: partitionShape })).rejects.toMatchObject({ code: "ANALYZER_HTTP", httpStatus: 400 });
    expect(fake.generateCalls).toHaveLength(2);
    expect(sentMessages(fake)).toEqual(flat);
    // Flat failed too: the partition is not blamed, the next call tries it again.
    fake.scriptLlm(new Error("failed (400): Conversation roles must alternate user/assistant/user/assistant"), { content: "{}" });
    await llm.analyzerClient().complete({}, flat, { cachePartition: partitionShape });
    expect((fake.generateCalls[2]!.input.messages as unknown[]).length).toBe(3);
    expect(sentMessages(fake)).toEqual(flat);
    fake.scriptLlm({ content: "{}" });
    await llm.analyzerClient().complete({}, flat, { cachePartition: partitionShape });
    expect(fake.generateCalls).toHaveLength(5);
    expect(sentMessages(fake)).toEqual(flat);
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

  const partition = {
    cacheSegments: [
      { kind: "app-static", messages: [{ role: "system", content: "SYS" }] },
      { kind: "config-static", messages: [{ role: "user", content: "CONFIG" }] },
      { kind: "character-static", messages: [{ role: "user", content: "ROSTER" }] },
      { kind: "outfit-static", messages: [{ role: "user", content: "OUTFITS" }] },
    ],
    liveMessages: [{ role: "user", content: "LIVE" }],
  };
  const sentMessages = (fake: ReturnType<typeof setup>["fake"]) => fake.generateCalls.at(-1)!.input.messages as Array<Record<string, unknown>>;

  test("analyzerClient sends the cache partition static-first; non-Anthropic gets no markers", async () => {
    const { fake, llm } = setup();
    fake.scriptLlm({ content: "{}" });
    await llm.analyzerClient().complete({}, [{ role: "system", content: "SYS" }, { role: "user", content: "LIVE+STATIC" }], { cachePartition: partition });
    expect(sentMessages(fake)).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "CONFIG" },
      { role: "user", content: "ROSTER" },
      { role: "user", content: "OUTFITS" },
      { role: "user", content: "LIVE" },
    ]);
    fake.scriptLlm({ content: "{}" });
    await llm.analyzerClient().complete({}, [{ role: "user", content: "FLAT" }], { cachePartition: { cacheSegments: "bad" } });
    expect(sentMessages(fake)).toEqual([{ role: "user", content: "FLAT" }]);
  });

  test("temperature is left out for mandatory-reasoning models on OpenAI-format connections only", async () => {
    const { fake, llm, setConfig } = setup({ analysis: { connectionId: "oa", model: "gpt-5", temperature: 0.4 } });
    const temperature = () => (fake.generateCalls.at(-1)!.input.parameters as Record<string, unknown>).temperature;
    fake.scriptLlm({ content: "ok" }, { content: "ok" }, { content: "ok" });
    await llm.complete({ purpose: "t", messages: [{ role: "user", content: "x" }], responseMode: "text" });
    expect(temperature()).toBeUndefined();
    setConfig({ analysis: { connectionId: "cl", model: "gpt-5", temperature: 0.4 } });
    await llm.complete({ purpose: "t", messages: [{ role: "user", content: "x" }], responseMode: "text" });
    expect(temperature()).toBe(0.4);
    setConfig({ analysis: { connectionId: "cl", model: "claude-haiku-5", temperature: 0.4 } });
    await llm.complete({ purpose: "t", messages: [{ role: "user", content: "x" }], responseMode: "text" });
    expect(temperature()).toBeUndefined();
  });

  describe("Gemini 4 prefix preparation (AM fXe_91 / vZe_91, 0.9.91)", () => {
    const turns = [
      { role: "user", content: 'V5 CACHE PREPARATION\n{"mode":"prepare"}' },
      { role: "assistant", content: '{"ready":true}' },
    ];
    const prepPartition = (staticBlocksInSystem?: boolean) => ({
      namespace: "v5",
      cacheSegments: [
        { kind: "app-static", messages: [{ role: "system", content: "SYS" }] },
        { kind: "config-static", messages: [{ role: "user", content: "STATIC" }] },
      ],
      liveMessages: [{ role: "user", content: "LIVE" }],
      prefixPreparation: { ...(staticBlocksInSystem === undefined ? {} : { staticBlocksInSystem }), instruction: "I", turns },
    });
    const flat = [{ role: "system" as const, content: "SYS" }, { role: "user" as const, content: "STATIC+LIVE" }];
    const run = async (provider: string, model: string, partitionValue: unknown) => {
      const { fake, llm } = setup({ analysis: { connectionId: "g", model, jsonMode: false } });
      fake.llmConnections.push({ id: "g", name: "G", provider, api_url: "", model: "", preset_id: null, is_default: false, has_api_key: true, metadata: {}, reasoning_bindings: null, created_at: 0, updated_at: 0 });
      fake.scriptLlm({ content: "{}" });
      await llm.analyzerClient().complete({}, flat, { cachePartition: partitionValue });
      return sentMessages(fake);
    };

    test("static blocks go to one leading system message, then the preparation turns, then the live input", async () => {
      const expected = [
        { role: "system", content: "I\n\nSYS\n\nSTATIC" },
        { role: "user", content: 'V5 CACHE PREPARATION\n{"mode":"prepare"}' },
        { role: "assistant", content: '{"ready":true}' },
        { role: "user", content: "LIVE" },
      ];
      expect(await run("openrouter", "gemini-4-argon", prepPartition(true))).toEqual(expected);
      expect(await run("openrouter", "google/gemini-4-hydrogen", prepPartition(true))).toEqual(expected);
      expect(await run("google", "models/gemini-4-carbon", prepPartition(true))).toEqual(expected);
    });

    test("without staticBlocksInSystem the static blocks keep their roles and nothing is merged", async () => {
      expect(await run("openrouter", "gemini-4-argon", prepPartition())).toEqual([
        { role: "system", content: "I" },
        { role: "system", content: "SYS" },
        { role: "user", content: "STATIC" },
        ...turns,
        { role: "user", content: "LIVE" },
      ]);
    });

    test("other models send the partition unchanged", async () => {
      const unchanged = [{ role: "system", content: "SYS" }, { role: "user", content: "STATIC" }, { role: "user", content: "LIVE" }];
      expect(await run("google", "gemini-3.5-flash", prepPartition(true))).toEqual(unchanged);
      expect(await run("openai", "gpt-x", prepPartition(true))).toEqual(unchanged);
      expect(await run("openrouter", "gemini-4-argon-preview", prepPartition(true))).toEqual(unchanged);
    });

    test("pure helpers: fXe_91 shape, vZe_91 part arrays and breakpoints", () => {
      expect(prefixPreparationModel("projects/p/locations/us/publishers/google/models/gemini-4-argon")).toBe(true);
      expect(prefixPreparationModel("vendor/gemini-4-argon")).toBe(false);
      const p = prepPartition(true);
      expect(applyPrefixPreparation({ ...p, prefixPreparation: undefined }, true)).toEqual({ ...p, prefixPreparation: undefined });
      const applied = applyPrefixPreparation(p, false) as Record<string, unknown>;
      expect("prefixPreparation" in applied).toBe(false);
      expect(applied.namespace).toBe("v5");
      expect(mergeLeadingSystemMessages(
        [{ role: "system", content: "A" }, { role: "system", content: [{ type: "text", text: "B" }, { type: "text", text: "C" }] }, { role: "user", content: "U" }],
        [0, 1, 2],
      )).toEqual({
        messages: [{ role: "system", content: [{ type: "text", text: "A" }, { type: "text", text: "\n\nB" }, { type: "text", text: "\n\nC" }] }, { role: "user", content: "U" }],
        cacheBreakpoints: [0, 1],
      });
      const single = [{ role: "system" as const, content: "A" }, { role: "user" as const, content: "U" }];
      expect(mergeLeadingSystemMessages(single).messages).toEqual(single);
      expect(prefixPreparedMessages(p, "gemini-4-argon", "anthropic")!.messages[2]).toEqual({ role: "user", content: "STATIC" });
    });
  });

  test("Anthropic gets cache breakpoints at segment ends, two when Lumiverse prompt caching is on", async () => {
    const { fake, llm } = setup({ analysis: { connectionId: "cl" } });
    fake.scriptLlm({ content: "{}" });
    await llm.analyzerClient().complete({}, [], { cachePartition: partition });
    expect(sentMessages(fake).map((m) => Boolean(m.cache_control))).toEqual([true, true, true, true, false]);

    fake.llmConnections[1]!.metadata = { prompt_caching: true };
    // A fresh service: the first one cached the connection metadata.
    const cachedLlm = createLlmService({ host: fake.host, userId: fake.userId, loadConfig: async () => normalizeConfig({ analysis: { connectionId: "cl" } }) });
    fake.scriptLlm({ content: "{}" });
    await cachedLlm.analyzerClient().complete({}, [], { cachePartition: partition });
    expect(sentMessages(fake).map((m) => Boolean(m.cache_control))).toEqual([true, false, false, true, false]);
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
