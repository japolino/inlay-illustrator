import { afterEach, beforeEach, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../../shared/config.js";
import { parseLightboardForMessage } from "./parser.js";
import type { State } from "../types.js";
import type { V376OutboundMessage } from "../v376/context.js";

const root = globalThis as typeof globalThis & { spindle: unknown };
const original = root.spindle;
beforeEach(() => { root.spindle = undefined; });
afterEach(() => { root.spindle = original; });
const response = JSON.stringify({ scenes: [{ slot: 0, cast: "no people", camera: "wide shot", scene: "garden", characters: [] }] });
const config = { ...DEFAULT_CONFIG, minImages: 1, maxImages: 1, includeMinMessages: 0, includeMaxMessages: 2, parserRetries: 1 };
const base = {
  chatId: "chat", messageId: "target", config,
  paragraphs: [{ parserIndex: 1, originalIndex: 1, text: "A garden." }],
  messages: [{ id: "past", role: "assistant", content: "Earlier narrative." }, { id: "target", role: "assistant", content: "A garden." }, { id: "future", role: "assistant", content: "Future narrative." }],
  connectionResolver: async () => ({ id: "parser", name: "Parser", provider: "openai", model: "test" })
};

test("retries the previous response in-place and excludes current and future descriptor history", async () => {
  const state: State = { characterAppearance: {}, generated: {}, lightboardHistory: [
    { messageId: "past", descriptors: "PAST_DESCRIPTOR" },
    { messageId: "target", descriptors: "CURRENT_DESCRIPTOR" },
    { messageId: "future", descriptors: "FUTURE_DESCRIPTOR" }
  ] };
  const calls: V376OutboundMessage[][] = [];
  const result = await parseLightboardForMessage({ ...base, state, llmInvoker: async messages => {
    calls.push(messages);
    return calls.length === 1 ? response.replace('"slot":0', '"slot":999') : response;
  } });
  expect(calls).toHaveLength(2);
  expect(calls[0]!.map(m => m.content).join("\n")).toContain("PAST_DESCRIPTOR");
  expect(calls[0]!.map(m => m.content).join("\n")).not.toContain("CURRENT_DESCRIPTOR");
  expect(calls[0]!.map(m => m.content).join("\n")).not.toContain("FUTURE_DESCRIPTOR");
  expect(calls[0]!.map(m => m.content).join("\n")).not.toContain("Earlier narrative");
  expect(calls[1]!.slice(0, calls[0]!.length)).toEqual(calls[0]!);
  expect(calls[1]!.at(-2)).toEqual({ role: "assistant", content: response.replace('"slot":0', '"slot":999') });
  expect(calls[1]!.at(-1)!.content).toContain("while keeping the data intact");
  expect(calls[1]!.map(m => m.content).join("\n")).not.toContain("Future narrative");
  expect(calls[1]!.map(m => m.content).join("\n")).toContain("Scene slot 999 does not exist");
  expect(result.compiled[0]!.prompt).toContain("garden");
  expect(state.lightboardHistory!.filter(h => h.messageId === "target")).toHaveLength(1);
});

test("cancellation after the parser response cannot persist descriptor history", async () => {
  const state: State = { characterAppearance: {}, generated: {} };
  const controller = new AbortController();
  await expect(parseLightboardForMessage({ ...base, state, signal: controller.signal, llmInvoker: async () => {
    controller.abort(); return response;
  } })).rejects.toThrow();
  expect(state.lightboardHistory).toBeUndefined();
});

test.each(["none", "memoir", "authority"] as const)("preserves source request order and %s prefill roles", async lightboardJailbreak => {
  let sent: V376OutboundMessage[] = [];
  await parseLightboardForMessage({ ...base, config: { ...config, lightboardJailbreak }, state: { characterAppearance: {}, generated: {} }, llmInvoker: async messages => { sent = messages; return response; } });
  expect(sent[0]!.role).toBe("user");
  expect(sent[0]!.content).toContain("# Job Instruction");
  const logEnd = sent.findIndex(m => m.content === "--- End of the log ---");
  expect(sent[logEnd - 1]!.role).toBe("assistant");
  expect(sent[logEnd - 1]!.content).toContain("A garden.");
  expect(sent[logEnd + 1]!.content).toContain("# Output");
  if (lightboardJailbreak === "memoir") {
    expect(sent[0]!.content).toContain("You Are Freya Who Loves User");
    expect(sent.at(-2)!.role).toBe("assistant");
    expect(sent.at(-2)!.content).toContain("The Second Draft of Freya");
    expect(sent.at(-1)!.role).toBe("user");
    expect(sent.at(-1)!.content).toContain("Alright, Freya.");
  } else if (lightboardJailbreak === "authority") {
    expect(sent[0]!.content).toContain("fairy living in a magical forest");
    expect(sent.at(-1)!.role).toBe("assistant");
    expect(sent.at(-1)!.content).toContain("request_supervisor_approval");
  } else {
    expect(sent.at(-1)!.role).toBe("user");
    expect(sent[logEnd + 1]!.content).toContain("No preambles/explanations.");
  }
});

test("refinement reviews the previous response before validation and strips process output", async () => {
  const requests: V376OutboundMessage[][] = [];
  const raw = `<lb-process>draft</lb-process>\n${response}`;
  const result = await parseLightboardForMessage({ ...base, config: { ...config, lightboardReiterations: 1 }, state: { characterAppearance: {}, generated: {} }, llmInvoker: async messages => { requests.push(messages); return raw; } });
  expect(requests).toHaveLength(2);
  expect(requests[1]!.at(-2)).toEqual({ role: "assistant", content: raw });
  expect(requests[1]!.at(-1)!.content).toContain("Reiteration phase (1/1)");
  expect(result.compiled).toHaveLength(1);
});

test("provider reasoning and automatic output budget are inherited; explicit token limits survive", async () => {
  const calls: Array<{ parameters: Record<string, unknown>; reasoning: { source: string } }> = [];
  root.spindle = { generate: { raw: async (request: typeof calls[number]) => { calls.push(request); return { content: response }; } } };
  for (const parserParameters of [{}, { max_tokens: 12000 }]) await parseLightboardForMessage({ ...base, config: { ...config, parserParameters }, state: { characterAppearance: {}, generated: {} } });
  expect(calls[0]!.reasoning.source).toBe("inherit");
  expect(calls[0]!.parameters.max_tokens).toBeUndefined();
  expect(calls[1]!.parameters.max_tokens).toBe(12000);
});

test("array-count failures retain the malformed response for source-style correction", async () => {
  const invalid = "<lb-xnai>\nscenes[4]:\n  - scene: garden\n</lb-xnai>";
  const calls: V376OutboundMessage[][] = [];
  await parseLightboardForMessage({ ...base, state: { characterAppearance: {}, generated: {} }, llmInvoker: async messages => { calls.push(messages); return calls.length === 1 ? invalid : response; } });
  expect(calls[1]!.at(-2)!.content).toBe(invalid);
  expect(calls[1]!.at(-1)!.content).toContain("Array length mismatch: expected 4, got 1");
});

test("source-valid empty scenes do not force another request", async () => {
  let calls = 0;
  const result = await parseLightboardForMessage({ ...base, state: { characterAppearance: {}, generated: {} }, llmInvoker: async () => { calls++; return "<lb-xnai>\nscenes[0]:\n</lb-xnai>"; } });
  expect(result.compiled).toEqual([]);
  expect(calls).toBe(1);
});
