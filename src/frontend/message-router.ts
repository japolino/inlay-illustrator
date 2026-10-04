import { normalizeConfig, type Config } from "../shared/config.js";
import type { BackendMessage, ImageConnection, ParserConnection } from "./contracts.js";

export type BackendState = {
  config: Config;
  parserConnections: ParserConnection[];
  imageConnections: ImageConnection[];
  status: string;
};

export type BackendMessageActions = {
  replaceState(state: BackendState): void;
  replaceConfig(config: Config): void;
  updateStatus(status: string): void;
  refreshParserConnections(): void;
};

/** Routes chat-scoped backend messages (messages for another chat are ignored). */
export function routeBackendMessage(
  message: BackendMessage,
  getActiveChatId: () => string,
  actions: BackendMessageActions
): void {
  if (message.chatId && message.chatId !== getActiveChatId()) return;

  if (message.type === "config_updated" && message.config) {
    actions.replaceConfig(normalizeConfig(message.config));
    return;
  }

  if (message.type === "state" && message.config) {
    const parserConnections = message.parserConnections || [];
    actions.replaceState({
      config: normalizeConfig(message.config),
      parserConnections,
      imageConnections: message.imageConnections || [],
      status: "Ready"
    });
    if (parserConnections.length === 0) actions.refreshParserConnections();
    return;
  }

  if (message.type === "status") {
    actions.updateStatus(message.error
      ? `${message.status || "Error"}: ${message.error}`
      : String(message.status || "Ready"));
  }
}
