import { beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import {
  routeBackendMessage,
  type BackendMessageActions,
  type BackendState
} from "./message-router.js";

let states: BackendState[];
let memories: Array<{ characterAppearance: Record<string, string>; status: string }>;
let statuses: string[];
let refreshes: number;
let defaultsApplied: number;
let actions: BackendMessageActions;

beforeEach(() => {
  states = [];
  memories = [];
  statuses = [];
  refreshes = 0;
  defaultsApplied = 0;
  actions = {
    replaceState: (state) => states.push(state),
    replaceCharacterMemory: (characterAppearance, status) => {
      memories.push({ characterAppearance, status });
    },
    updateStatus: (status) => statuses.push(status),
    refreshParserConnections: () => { refreshes += 1; },
    applyImageGenerationDefaults: () => { defaultsApplied += 1; }
  };
});

describe("frontend backend-message routing", () => {
  test("replaces state, fills missing defaults, and keeps available parser connections", () => {
    routeBackendMessage({
      type: "state",
      config: { ...DEFAULT_CONFIG, enabled: false },
      parserConnections: [{ id: "parser", name: "Parser", provider: "openai", model: "model" }],
      characterAppearance: { Alice: "blonde hair" }
    }, () => "chat-1", actions);

    expect(states).toEqual([{
      config: { ...DEFAULT_CONFIG, enabled: false },
      parserConnections: [{ id: "parser", name: "Parser", provider: "openai", model: "model" }],
      characterAppearance: { Alice: "blonde hair" },
      status: "Ready"
    }]);
    expect(refreshes).toBe(0);
    expect(defaultsApplied).toBe(1);
  });

  test("refreshes parser connections when state contains none", () => {
    routeBackendMessage({ type: "state", config: DEFAULT_CONFIG }, () => "chat-1", actions);

    expect(states[0]?.parserConnections).toEqual([]);
    expect(states[0]?.characterAppearance).toEqual({});
    expect(refreshes).toBe(1);
    expect(defaultsApplied).toBe(1);
  });

  test("applies memory updates only to the active non-empty chat", () => {
    routeBackendMessage({
      type: "character_memory_updated",
      chatId: "other-chat",
      characterAppearance: { Ignored: "red hair" }
    }, () => "chat-1", actions);
    routeBackendMessage({
      type: "character_memory_updated",
      chatId: "chat-1",
      characterAppearance: { Alice: "blue eyes" }
    }, () => "chat-1", actions);

    expect(memories).toEqual([{
      characterAppearance: { Alice: "blue eyes" },
      status: "Character visual baseline updated."
    }]);
  });

  test("formats normal and error statuses and reports generated image counts", () => {
    routeBackendMessage({ type: "status", status: "Generated", record: { imageUrls: ["one", "two"] } }, () => "", actions);
    routeBackendMessage({ type: "status", status: "Error", error: "provider failed" }, () => "", actions);
    routeBackendMessage({ type: "status", record: { imageUrls: [] } }, () => "", actions);

    expect(statuses).toEqual([
      "Generated\n2 image(s) generated.",
      "Error: provider failed",
      "Ready\n0 image(s) generated."
    ]);
  });

  test("formats and caps Danbooru diagnostic responses", () => {
    routeBackendMessage({ type: "danbooru_test", result: { value: "x".repeat(1200) } }, () => "", actions);

    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toStartWith("Danbooru endpoint responded.\n{");
    expect(statuses[0].length).toBe("Danbooru endpoint responded.\n".length + 1000);
  });
});
