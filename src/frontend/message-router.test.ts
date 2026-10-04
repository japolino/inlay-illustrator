import { beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { routeBackendMessage, type BackendMessageActions, type BackendState } from "./message-router.js";

let states: BackendState[];
let configs: typeof DEFAULT_CONFIG[];
let statuses: string[];
let refreshes: number;
let actions: BackendMessageActions;

beforeEach(() => {
  states = [];
  configs = [];
  statuses = [];
  refreshes = 0;
  actions = {
    replaceConfig: (config) => configs.push(config),
    replaceState: (state) => states.push(state),
    updateStatus: (status) => statuses.push(status),
    refreshParserConnections: () => { refreshes += 1; }
  };
});

describe("frontend backend-message routing", () => {
  test("applies config acknowledgements without replacing state", () => {
    routeBackendMessage({ type: "config_updated", chatId: "chat-1", config: { ...DEFAULT_CONFIG, fabCorner: "top-left" } }, () => "chat-1", actions);
    expect(configs).toEqual([{ ...DEFAULT_CONFIG, fabCorner: "top-left" }]);
    expect(states).toEqual([]);
  });

  test("replaces state with a normalized config and keeps connections", () => {
    routeBackendMessage({
      type: "state",
      config: { ...DEFAULT_CONFIG, enabled: false },
      parserConnections: [{ id: "parser", name: "Parser", provider: "openai", model: "model" }]
    }, () => "chat-1", actions);
    expect(states).toEqual([{
      config: { ...DEFAULT_CONFIG, enabled: false },
      parserConnections: [{ id: "parser", name: "Parser", provider: "openai", model: "model" }],
      imageConnections: [],
      status: "Ready"
    }]);
    expect(refreshes).toBe(0);
  });

  test("refreshes parser connections when state contains none", () => {
    routeBackendMessage({ type: "state", config: DEFAULT_CONFIG }, () => "chat-1", actions);
    expect(states[0]?.parserConnections).toEqual([]);
    expect(refreshes).toBe(1);
  });

  test("ignores messages scoped to another chat", () => {
    routeBackendMessage({ type: "state", chatId: "other", config: DEFAULT_CONFIG }, () => "chat-1", actions);
    routeBackendMessage({ type: "status", chatId: "other", status: "Generated" }, () => "chat-1", actions);
    expect(states).toEqual([]);
    expect(statuses).toEqual([]);
  });

  test("formats normal and error statuses", () => {
    routeBackendMessage({ type: "status", status: "Done" }, () => "", actions);
    routeBackendMessage({ type: "status", status: "Error", error: "provider failed" }, () => "", actions);
    routeBackendMessage({ type: "status" }, () => "", actions);
    expect(statuses).toEqual(["Done", "Error: provider failed", "Ready"]);
  });
});
