import type { Config } from "../shared/config.js";

export type ParserConnection = {
  id: string;
  name: string;
  provider: string;
  model: string;
};

export type ImageConnection = {
  id: string;
  name: string;
  provider: string;
  model: string;
  is_default?: boolean;
  default_parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type MountedComponent = {
  destroy(): void;
};

export type FrontendSnapshot = {
  config: Config;
  parserConnections: ParserConnection[];
  imageConnections: ImageConnection[];
  characterAppearance: Record<string, string>;
  status: string;
};

export type FrontendActions = {
  activeChatId(): string;
  patchConfig(patch: Partial<Config>): void;
  requestState(): void;
  sendToBackend(payload: unknown): void;
  updateStatus(status: string): void;
  openGallery?(): void;
};

export type BackendMessage = {
  type?: string;
  chatId?: string;
  config?: Config;
  parserConnections?: ParserConnection[];
  imageConnections?: ImageConnection[];
  characterAppearance?: Record<string, string>;
  avatarVisualSupplements?: Record<string, unknown>;
  avatarVisionAttempts?: Record<string, unknown>;
  status?: string;
  error?: string;
  record?: { imageUrls?: string[]; slots?: Array<{ imageUrl?: string }> };
  operationId?: string;
  messageId?: string;
  stage?: "queued" | "loading" | "parsing" | "preparing" | "generating" | "persisting" | "completed" | "failed" | "cancelled";
  completed?: number;
  total?: number;
  detail?: string;
};

export type ImageGenerationSettings = {
  promptParserConnectionId?: string | null;
  promptParserModel?: string;
  promptParserParameters?: Record<string, unknown>;
  activeImageGenConnectionId?: string | null;
  model?: string;
  parameters?: Record<string, unknown>;
};
