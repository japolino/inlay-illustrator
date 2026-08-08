import { DEFAULT_CONFIG, normalizeConfig, type Config } from "./shared/config.js";
import { acceptAvatarImageResponse } from "./backend/avatar-image-bridge.js";
import { isOwnMessage } from "./backend/context.js";
import {
  generateForMessage,
  getStoredImageDetails,
  rerunStoredImage,
  type StoredImageActionRequest
} from "./backend/generation.js";
import { prepareAndDispatchImageJobs, rerollImageParameters } from "./backend/images.js";
import { stripInlayContent, stripInlayFromMessages } from "./backend/inlay-content.js";
import { logStage } from "./backend/logging.js";
import { cancelChatGenerations } from "./backend/operation-manager.js";
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
import { getConfig, sendState, setConfig, updateState } from "./backend/storage.js";
import { keysOf } from "./backend/utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

/** Stable compatibility surface for the existing backend unit tests. */
export const __testables = {
  DEFAULT_CONFIG,
  activePromptPreset,
  assemblePrompt,
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
  rerollImageParameters,
  normalizeConfig,
  renderPrompt,
  selectPromptEntries,
  stripInlayContent,
  stripInlayFromMessages,
  validatePreprocessedTarget
};

spindle.registerInterceptor(async (messages) => stripInlayFromMessages(messages));

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
    await generateForMessage(payload.chatId, payload.messageId, payload.content, userId, { config });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStage(configForError || { debugLogging: true }, "auto_generation_error", { error: message }, "error");
    spindle.log.error(`Auto generation failed: ${message}`);
    spindle.sendToFrontend({ type: "status", chatId: payload.chatId, status: "Error", error: message }, userId);
  }
});

spindle.onFrontendMessage(async (payload: unknown, userId) => {
  const message = payload as Record<string, unknown>;
  let configForError: Config | null = null;
  try {
    if (acceptAvatarImageResponse(message)) return;
    if (message.type === "get_state") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      logStage(config, "frontend_get_state", { chatId: chatId || null });
      await sendState(userId, chatId, config);
    } else if (message.type === "set_config") {
      const next = await setConfig((message.patch || {}) as Partial<Config>, userId);
      configForError = next;
      logStage(next, "frontend_set_config", { patchKeys: keysOf(message.patch) });
      spindle.sendToFrontend({
        type: "config_updated",
        chatId: String(message.chatId || ""),
        config: next
      }, userId);
    } else if (message.type === "character_tags_update") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      const state = await updateState(chatId, userId, (current) => {
        upsertCharacterTag(current, message.oldName, message.name, message.tags);
      });
      logStage(config, "character_tags_update", { chatId, oldName: String(message.oldName || ""), name: String(message.name || "") });
      spindle.sendToFrontend({
        type: "character_memory_updated",
        chatId,
        characterAppearance: state.characterAppearance
      }, userId);
    } else if (message.type === "character_tags_delete") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      const state = await updateState(chatId, userId, (current) => {
        deleteCharacterTag(current, message.name);
      });
      logStage(config, "character_tags_delete", { chatId, name: String(message.name || "") });
      spindle.sendToFrontend({
        type: "character_memory_updated",
        chatId,
        characterAppearance: state.characterAppearance
      }, userId);
    } else if (message.type === "cancel_generation") {
      const chatId = String(message.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      const cancelled = cancelChatGenerations(userId, chatId, String(message.operationId || "") || undefined);
      spindle.sendToFrontend({
        type: "status",
        chatId,
        status: cancelled.length ? "Cancellation requested…" : "No active generation to cancel."
      }, userId);
    } else if (message.type === "generate_latest") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      logStage(config, "manual_generate_latest", { chatId });
      const messages = await spindle.chat.getMessages(chatId);
      const target = [...messages].reverse().find((candidate) => candidate.role === "assistant" && !isOwnMessage(candidate));
      if (!target) throw new Error("No assistant message found.");
      spindle.sendToFrontend({ type: "status", chatId, status: "Generating..." }, userId);
      await generateForMessage(chatId, target.id, target.content, userId, {
        config,
        messages: messages as import("./backend/types.js").ChatMessage[]
      });
    } else if (message.type === "get_inlay_image_details") {
      const request: StoredImageActionRequest = {
        chatId: String(message.chatId || ""),
        messageId: String(message.messageId || "") || undefined,
        swipeId: Number.isInteger(Number(message.swipeId)) ? Number(message.swipeId) : undefined,
        imageIndex: Number.isInteger(Number(message.imageIndex)) ? Number(message.imageIndex) : undefined,
        imageId: String(message.imageId || "") || undefined,
        imageUrl: String(message.imageUrl || "") || undefined
      };
      try {
        const details = await getStoredImageDetails(request, userId);
        spindle.sendToFrontend({
          type: "inlay_image_details_result",
          requestId: String(message.requestId || ""),
          ok: true,
          ...details
        }, userId);
      } catch (error) {
        spindle.sendToFrontend({
          type: "inlay_image_details_result",
          requestId: String(message.requestId || ""),
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }, userId);
      }
    } else if (message.type === "reroll_image" || message.type === "rerun_image_sidecar") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId) throw new Error("Open the image's chat first.");
      const numericIndex = Number(message.imageIndex);
      const numericSwipe = Number(message.swipeId);
      const request: StoredImageActionRequest = {
        chatId,
        messageId: String(message.messageId || "") || undefined,
        swipeId: Number.isInteger(numericSwipe) ? numericSwipe : undefined,
        imageIndex: Number.isInteger(numericIndex) && numericIndex >= 0 ? numericIndex : undefined,
        imageId: String(message.imageId || "") || undefined,
        imageUrl: String(message.imageUrl || "") || undefined
      };
      const rerunSidecar = message.type === "rerun_image_sidecar";
      const actionLabel = rerunSidecar ? "Rerunning sidecar..." : "Rerolling image...";
      spindle.sendToFrontend({ type: "status", chatId, status: actionLabel }, userId);
      const result = await rerunStoredImage(request, rerunSidecar, userId, config);
      spindle.sendToFrontend({
        type: "inlay_image_action_result",
        requestId: String(message.requestId || ""),
        operation: rerunSidecar ? "sidecar" : "reroll",
        ok: true,
        chatId,
        messageId: result.record.messageId,
        imageIndex: result.index,
        imageUrl: result.record.imageUrls[result.index] || ""
      }, userId);
      spindle.sendToFrontend({ type: "status", chatId, status: rerunSidecar ? "Sidecar rerun complete" : "Image rerolled", record: result.record }, userId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStage(configForError || { debugLogging: true }, "frontend_message_error", { type: String(message.type || ""), error: errorMessage }, "error");
    spindle.log.error(errorMessage);
    if (message.type === "reroll_image" || message.type === "rerun_image_sidecar") {
      spindle.sendToFrontend({
        type: "inlay_image_action_result",
        requestId: String(message.requestId || ""),
        operation: message.type === "rerun_image_sidecar" ? "sidecar" : "reroll",
        ok: false,
        error: errorMessage
      }, userId);
    }
    spindle.sendToFrontend({ type: "status", chatId: String(message.chatId || ""), status: "Error", error: errorMessage }, userId);
  }
});

spindle.log.info("Inlay Illustrator loaded.");
