import { beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import {
  routeBackendMessage,
  type BackendMessageActions,
  type BackendState
} from "./message-router.js";

let states: BackendState[];
let configs: typeof DEFAULT_CONFIG[];
let memories: Array<{ characterAppearance: Record<string, string>; status: string }>;
let statuses: string[];
let refreshes: number;
let defaultsApplied: number;
let actions: BackendMessageActions;

beforeEach(() => {
  states = [];
  configs = [];
  memories = [];
  statuses = [];
  refreshes = 0;
  defaultsApplied = 0;
  actions = {
    replaceConfig: (config) => configs.push(config),
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
  test("applies config acknowledgements without replacing or rerendering panel state", () => {
    routeBackendMessage({
      type: "config_updated",
      chatId: "chat-1",
      config: { ...DEFAULT_CONFIG, customParserInstructions: "keep typing" }
    }, () => "chat-1", actions);

    expect(configs).toEqual([{ ...DEFAULT_CONFIG, customParserInstructions: "keep typing" }]);
    expect(states).toEqual([]);
    expect(defaultsApplied).toBe(0);
  });

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

  test("ignores state responses scoped to another chat", () => {
    routeBackendMessage({
      type: "state",
      chatId: "other-chat",
      config: { ...DEFAULT_CONFIG, enabled: false },
      characterAppearance: { Ignored: "red hair" }
    }, () => "chat-1", actions);

    expect(states).toEqual([]);
    expect(refreshes).toBe(0);
    expect(defaultsApplied).toBe(0);
  });

  test("ignores memory updates scoped to another chat while retaining unscoped compatibility", () => {
    routeBackendMessage({
      type: "character_memory_updated",
      chatId: "other-chat",
      characterAppearance: { Ignored: "red hair" }
    }, () => "chat-1", actions);
    routeBackendMessage({
      type: "character_memory_updated",
      characterAppearance: { Legacy: "green eyes" }
    }, () => "chat-1", actions);
    routeBackendMessage({
      type: "character_memory_updated",
      chatId: "chat-1",
      characterAppearance: { Alice: "blue eyes" }
    }, () => "chat-1", actions);

    expect(memories).toEqual([{
      characterAppearance: { Legacy: "green eyes" },
      status: "Character visual baseline updated."
    }, {
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

  test("renders operation-scoped progressive status and ignores another chat", () => {
    routeBackendMessage({
      type: "generation_progress",
      chatId: "other-chat",
      operationId: "other",
      stage: "generating",
      completed: 1,
      total: 4
    }, () => "chat-1", actions);
    routeBackendMessage({
      type: "generation_progress",
      chatId: "chat-1",
      operationId: "current",
      stage: "generating",
      completed: 2,
      total: 4,
      detail: "Illustration 2 ready."
    }, () => "chat-1", actions);

    expect(statuses).toEqual(["Generating illustrations 2/4…\nIllustration 2 ready."]);
  });

  test("ignores chat-scoped legacy status from another chat", () => {
    routeBackendMessage({ type: "status", chatId: "other-chat", status: "Generated" }, () => "chat-1", actions);
    expect(statuses).toEqual([]);
  });
});
