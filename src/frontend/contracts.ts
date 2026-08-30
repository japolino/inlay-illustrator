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
  quoteStyle: string;
  quoteExample: string;
  status: string;
};

export type FrontendActions = {
  activeChatId(): string;
  patchConfig(patch: Partial<Config>): void;
  patchQuoteSettings(patch: { quoteStyle?: string; quoteExample?: string }): void;
  requestState(): void;
  sendToBackend(payload: unknown): void;
  updateStatus(status: string): void;
  openGallery?(): void;
};

export type GalleryImageDTO = {
  chatId: string;
  messageId: string;
  swipeId: number;
  imageId: string;
  imageUrl: string;
  imageIndex: number;
  paragraph: number;
  prompt: string;
  negativePrompt: string;
  quote: string;
};

export type GalleryChatDTO = {
  chatId: string;
  quoteStyle?: string;
  images: GalleryImageDTO[];
};

export type InlayGalleryResultMessage = {
  type: "inlay_gallery_result";
  requestId: string;
  ok: boolean;
  page?: number;
  totalChats?: number;
  totalPages?: number;
  chatIds?: string[];
  chats?: GalleryChatDTO[];
  records?: GalleryChatDTO[];
  error?: string;
};

export type BackendMessage = {
  type?: string;
  chatId?: string;
  config?: Config;
  parserConnections?: ParserConnection[];
  characterAppearance?: Record<string, string>;
  quoteStyle?: string;
  quoteExample?: string;
  status?: string;
  /** Present on status messages: true while a generation/reroll is running (drives the floating action button). */
  busy?: boolean;
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
