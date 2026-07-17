import type { Config } from "../shared/config.js";

export type ParserConnection = {
  id: string;
  name: string;
  provider: string;
  model: string;
};

export type MountedComponent = {
  destroy(): void;
};

export type FrontendSnapshot = {
  config: Config;
  parserConnections: ParserConnection[];
  characterAppearance: Record<string, string>;
  status: string;
};

export type FrontendActions = {
  activeChatId(): string;
  patchConfig(patch: Partial<Config>): void;
  requestState(): void;
  sendToBackend(payload: unknown): void;
  updateStatus(status: string): void;
};

export type BackendMessage = {
  type?: string;
  chatId?: string;
  config?: Config;
  parserConnections?: ParserConnection[];
  characterAppearance?: Record<string, string>;
  status?: string;
  error?: string;
  record?: { imageUrls?: string[] };
};

export type ImageGenerationSettings = {
  promptParserConnectionId?: string | null;
  promptParserModel?: string;
  promptParserParameters?: Record<string, unknown>;
  activeImageGenConnectionId?: string | null;
  model?: string;
  parameters?: Record<string, unknown>;
};
