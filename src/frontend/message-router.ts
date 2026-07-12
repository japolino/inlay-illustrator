import { DEFAULT_CONFIG, type Config } from "../shared/config.js";
import type { BackendMessage, ParserConnection } from "./contracts.js";

export type BackendState = {
  config: Config;
  parserConnections: ParserConnection[];
  characterAppearance: Record<string, string>;
  status: string;
};

export type BackendMessageActions = {
  replaceState(state: BackendState): void;
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
  if (message.type === "state" && message.config) {
    if (message.chatId && message.chatId !== getActiveChatId()) return;
    const parserConnections = message.parserConnections || [];
    actions.replaceState({
      config: { ...DEFAULT_CONFIG, ...message.config },
      parserConnections,
      characterAppearance: message.characterAppearance || {},
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

  if (message.type === "danbooru_test") {
    actions.updateStatus(
      `Danbooru endpoint responded.\n${JSON.stringify(message.result, null, 2).slice(0, 1000)}`
    );
  }
}
