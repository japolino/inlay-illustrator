/**
 * All dev mock handler modules. Each area owns one file:
 * core.ts (ui lead), settings.ts (settings pages), workspace.ts (workspace tabs), chat.ts (chat-side + zoom).
 */
import { createMockBackend, type MockBackend, type MockBackendOptions } from "../mock-backend.js";
import { coreMockHandlers } from "./core.js";
import { settingsMockHandlers } from "./settings.js";
import { workspaceMockHandlers } from "./workspace.js";
import { chatMockHandlers } from "./chat.js";

export function createFullMockBackend(options: Omit<MockBackendOptions, "handlers"> = {}): MockBackend {
  return createMockBackend({ ...options, handlers: [coreMockHandlers(), settingsMockHandlers(), workspaceMockHandlers(), chatMockHandlers()] });
}
