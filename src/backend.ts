import { DEFAULT_CONFIG, normalizeConfig, type Config } from "./shared/config.js";
import { cleanupPrompt } from "./backend/cleanup.js";
import { isOwnMessage } from "./backend/context.js";
import { generateForMessage } from "./backend/generation.js";
import { prepareAndDispatchImageJobs } from "./backend/images.js";
import { logStage } from "./backend/logging.js";
import { deleteCharacterTag, upsertCharacterTag } from "./backend/memory.js";
import {
  continuityReference,
  formatTargetParagraphs,
  parserInstruction,
  parserMessages,
  parserUserRequest,
  preprocessTargetParagraphs,
  preprocessingInstruction,
  preprocessingUserRequest,
  validatePreprocessedTarget
} from "./backend/parser.js";
import { activePromptPreset, assemblePrompt, renderPrompt } from "./backend/prompt.js";
import { exactVisualKey, selectPromptEntries } from "./backend/scenes.js";
import { getConfig, getState, sendState, setConfig, writeJson } from "./backend/storage.js";
import type { DanbooruPayload } from "./backend/types.js";
import { keysOf, parseCorsJson } from "./backend/utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

/** Stable compatibility surface for the existing backend unit tests. */
export const __testables = {
  DEFAULT_CONFIG,
  activePromptPreset,
  assemblePrompt,
  cleanupPrompt,
  continuityReference,
  exactVisualKey,
  formatTargetParagraphs,
  parserInstruction,
  parserMessages,
  parserUserRequest,
  preprocessTargetParagraphs,
  preprocessingInstruction,
  preprocessingUserRequest,
  prepareAndDispatchImageJobs,
  normalizeConfig,
  renderPrompt,
  selectPromptEntries,
  validatePreprocessedTarget
};

spindle.on("GENERATION_ENDED", async (payload, userId) => {
  let configForError: Config | null = null;
  try {
    const config = await getConfig(userId);
    configForError = config;
    logStage(config, "generation_ended_event", {
      chatId: payload.chatId,
      messageId: payload.messageId || null,
      generationType: payload.generationType || null,
      hasError: Boolean(payload.error),
      hasContent: Boolean(payload.content),
      contentLength: String(payload.content || "").length
    });
    if (!config.enabled || !config.autoGenerate || payload.error || !payload.messageId || !payload.content) return;
    if (payload.generationType === "continue" || payload.generationType === "impersonate") return;
    await generateForMessage(payload.chatId, payload.messageId, payload.content, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStage(configForError || { debugLogging: true }, "auto_generation_error", { error: message }, "error");
    spindle.log.error(`Auto generation failed: ${message}`);
    spindle.sendToFrontend({ type: "status", status: "Error", error: message }, userId);
  }
});

spindle.onFrontendMessage(async (payload: unknown, userId) => {
  const message = payload as Record<string, unknown>;
  let configForError: Config | null = null;
  try {
    if (message.type === "get_state") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      logStage(config, "frontend_get_state", { chatId: chatId || null });
      await sendState(userId, chatId);
    } else if (message.type === "set_config") {
      const next = await setConfig((message.patch || {}) as Partial<Config>, userId);
      configForError = next;
      logStage(next, "frontend_set_config", { patchKeys: keysOf(message.patch) });
      await sendState(userId, String(message.chatId || ""));
    } else if (message.type === "character_tags_update") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      const state = await getState(chatId, userId);
      upsertCharacterTag(state, message.oldName, message.name, message.tags);
      await writeJson(`states/${chatId}.json`, state, userId);
      logStage(config, "character_tags_update", { chatId, oldName: String(message.oldName || ""), name: String(message.name || "") });
      await sendState(userId, chatId);
    } else if (message.type === "character_tags_delete") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      const state = await getState(chatId, userId);
      deleteCharacterTag(state, message.name);
      await writeJson(`states/${chatId}.json`, state, userId);
      logStage(config, "character_tags_delete", { chatId, name: String(message.name || "") });
      await sendState(userId, chatId);
    } else if (message.type === "generate_latest") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      logStage(config, "manual_generate_latest", { chatId });
      const messages = await spindle.chat.getMessages(chatId);
      const target = [...messages].reverse().find((candidate) => candidate.role === "assistant" && !isOwnMessage(candidate));
      if (!target) throw new Error("No assistant message found.");
      spindle.sendToFrontend({ type: "status", status: "Generating..." }, userId);
      await generateForMessage(chatId, target.id, target.content, userId);
    } else if (message.type === "test_danbooru") {
      const config = await getConfig(userId);
      configForError = config;
      logStage(config, "danbooru_test_start", { endpoint: config.danbooruEndpoint });
      const result = parseCorsJson<DanbooruPayload>(await spindle.cors(config.danbooruEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ tags: ["1girl", "blonde hair", "red eyes"] })
      }), "Danbooru test");
      spindle.sendToFrontend({ type: "danbooru_test", ok: true, result }, userId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStage(configForError || { debugLogging: true }, "frontend_message_error", { type: String(message.type || ""), error: errorMessage }, "error");
    spindle.log.error(errorMessage);
    spindle.sendToFrontend({ type: "status", status: "Error", error: errorMessage }, userId);
  }
});

spindle.log.info("Inlay Illustrator loaded.");
