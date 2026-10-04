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

/** Messages the backend sends to the frontend (loose: unknown fields are ignored). */
export type BackendMessage = {
  type?: string;
  chatId?: string;
  config?: Partial<Config>;
  parserConnections?: ParserConnection[];
  imageConnections?: ImageConnection[];
  status?: string;
  error?: string;
};

export type ImageGenerationSettings = {
  promptParserConnectionId?: string | null;
  promptParserModel?: string;
  promptParserParameters?: Record<string, unknown>;
  activeImageGenConnectionId?: string | null;
  model?: string;
  parameters?: Record<string, unknown>;
};
