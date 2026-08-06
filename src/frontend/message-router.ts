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

  if (message.type === "generation_progress" && message.stage) {
    if (message.chatId && message.chatId !== getActiveChatId()) return;
    const labels = {
      queued: "Queued…",
      loading: "Loading chat context…",
      parsing: "Parsing illustration prompts…",
      preparing: "Preparing image jobs…",
      generating: message.total
        ? `Generating illustrations ${message.completed || 0}/${message.total}…`
        : "Generating illustrations…",
      persisting: "Saving illustrations…",
      completed: "Generation complete.",
      failed: "Generation failed.",
      cancelled: "Generation cancelled."
    };
    actions.updateStatus(message.detail ? `${labels[message.stage]}\n${message.detail}` : labels[message.stage]);
    return;
  }

  if (message.type === "status") {
    if (message.chatId && message.chatId !== getActiveChatId()) return;
    let status = message.error
      ? `${message.status}: ${message.error}`
      : String(message.status || "Ready");
    if (message.record?.imageUrls) {
      status += `\n${message.record.imageUrls.filter(Boolean).length} image(s) generated.`;
    }
    actions.updateStatus(status);
    return;
  }
}
