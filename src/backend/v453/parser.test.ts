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

test("retries invalid slots, expands prior context, and excludes current and future descriptor history", async () => {
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
  expect(calls[0]![0]!.content).toContain("PAST_DESCRIPTOR");
  expect(calls[0]![0]!.content).not.toContain("CURRENT_DESCRIPTOR");
  expect(calls[0]![0]!.content).not.toContain("FUTURE_DESCRIPTOR");
  expect(calls[0]![1]!.content).not.toContain("Earlier narrative");
  expect(calls[1]![1]!.content).toContain("Earlier narrative");
  expect(calls[1]![1]!.content).not.toContain("Future narrative");
  expect(calls[1]![1]!.content).toContain("Scene slot 999 does not exist");
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
