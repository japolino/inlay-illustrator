import { DEFAULT_CONFIG, type Config } from "../shared/config.js";
import type { BackendMessage, ParserConnection } from "./contracts.js";

export type BackendState = {
  config: Config;
  parserConnections: ParserConnection[];
  characterAppearance: Record<string, string>;
  quoteStyle: string;
  quoteExample: string;
  status: string;
};

export type BackendMessageActions = {
  replaceState(state: BackendState): void;
  replaceConfig(config: Config): void;
  replaceCharacterMemory(characterAppearance: Record<string, string>, status: string): void;
  updateStatus(status: string): void;
  refreshParserConnections(): void;
  applyImageGenerationDefaults(): void;
};

export function routeBackendMessage(
  message: BackendMessage,
  getActiveChatId: () => string,
  actions: BackendMessageActions
): void {
  if (message.type === "config_updated" && message.config) {
    if (message.chatId && message.chatId !== getActiveChatId()) return;
    actions.replaceConfig({ ...DEFAULT_CONFIG, ...message.config });
    return;
  }

  if (message.type === "state" && message.config) {
    if (message.chatId && message.chatId !== getActiveChatId()) return;
    const parserConnections = message.parserConnections || [];
    actions.replaceState({
      config: { ...DEFAULT_CONFIG, ...message.config },
      parserConnections,
      characterAppearance: message.characterAppearance || {},
      quoteStyle: message.quoteStyle || "",
      quoteExample: message.quoteExample || "",
      status: "Ready"
    });
    if (parserConnections.length === 0) actions.refreshParserConnections();
    actions.applyImageGenerationDefaults();
    return;
  }

  if (message.type === "character_memory_updated") {
    if (message.chatId && message.chatId !== getActiveChatId()) return;
    actions.replaceCharacterMemory(
      message.characterAppearance || {},
      "Character visual baseline updated."
    );
    return;
  }

  if (message.type === "status") {
    let status = message.error
      ? `${message.status}: ${message.error}`
      : String(message.status || "Ready");
    if (message.record?.imageUrls) {
      status += `\n${message.record.imageUrls.length} image(s) generated.`;
    }
    actions.updateStatus(status);
    return;
  }
}
