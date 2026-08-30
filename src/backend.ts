import { DEFAULT_CONFIG, normalizeConfig, type Config } from "./shared/config.js";
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
import { deleteCharacterTag, upsertCharacterTag } from "./backend/memory.js";
import {
  continuityReference,
  formatTargetParagraphs,
  parserUserRequest,
  preprocessTargetParagraphs,
  preprocessingInstruction
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
  parserUserRequest,
  preprocessTargetParagraphs,
  preprocessingInstruction,
  prepareAndDispatchImageJobs,
  rerollImageParameters,
  normalizeConfig,
  renderPrompt,
  selectPromptEntries,
  stripInlayContent,
  stripInlayFromMessages
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
    spindle.sendToFrontend({ type: "status", status: "Error", error: message, busy: false }, userId);
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
    } else if (message.type === "set_quote_settings") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      const patch = message.patch && typeof message.patch === "object"
        ? message.patch as Record<string, unknown>
        : {};
      let quoteStyle: string | undefined;
      let quoteExample: string | undefined;
      await updateState(chatId, userId, (current) => {
        if (typeof patch.quoteStyle === "string") current.quoteStyle = patch.quoteStyle.trim();
        if (typeof patch.quoteExample === "string") current.quoteExample = patch.quoteExample.trim();
        quoteStyle = current.quoteStyle ?? "";
        quoteExample = current.quoteExample ?? "";
      });
      spindle.sendToFrontend({
        type: "quote_settings_updated",
        requestId: String(message.requestId || ""),
        chatId,
        quoteStyle,
        quoteExample,
        ok: true
      }, userId);
    } else if (message.type === "get_inlay_display_context") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      const chatMessages = await spindle.chat.getMessages(chatId);
      const roles = chatMessages.map((entry, index) => {
        const row = entry as unknown as Record<string, unknown>;
        const rawIndex = Number(row.index_in_chat);
        return {
          id: typeof row.id === "string" ? row.id : "",
          index: Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : index,
          role: entry.role === "assistant" ? "char" : entry.role
        };
      });
      spindle.sendToFrontend({
        type: "inlay_display_context",
        requestId: String(message.requestId || ""),
        chatId,
        ok: true,
        roles
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
    } else if (message.type === "generate_latest") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      logStage(config, "manual_generate_latest", { chatId });
      const messages = await spindle.chat.getMessages(chatId);
      const target = [...messages].reverse().find((candidate) => candidate.role === "assistant" && !isOwnMessage(candidate));
      if (!target) throw new Error("No assistant message found.");
      // generateForMessage emits the busy:true "Generating..." status itself
      // after its own early guards, so skipped work never wedges the FAB.
      await generateForMessage(chatId, target.id, target.content, userId, {
        config,
        messages: messages as import("./backend/types.js").ChatMessage[]
      });
    } else if (message.type === "list_inlay_gallery") {
      const requestId = String(message.requestId || "");
      const rawPage = Number(message.page);
      const page = Number.isFinite(rawPage) ? Math.floor(rawPage) : 1;
      const selectedChatId = typeof message.selectedChatId === "string" && message.selectedChatId ? String(message.selectedChatId) : undefined;
      try {
        const { listInlayGallery } = await import("./backend/storage.js");
        const result = await listInlayGallery(userId, page, selectedChatId);
        spindle.sendToFrontend({
          type: "inlay_gallery_result",
          requestId,
          ok: true,
          page: result.page,
          totalChats: result.totalChats,
          totalPages: result.totalPages,
          chatIds: result.chatIds,
          chats: result.chats,
          records: result.records ?? result.chats
        }, userId);
      } catch (error) {
        spindle.sendToFrontend({
          type: "inlay_gallery_result",
          requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }, userId);
      }
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
        const { getInlayImageDetailsExtended } = await import("./backend/stored-image-actions.js");
        const details = await getInlayImageDetailsExtended(request, userId);
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
    } else if (message.type === "update_inlay_prompt_data") {
      const requestId = String(message.requestId || "");
      const request: StoredImageActionRequest = {
        chatId: String(message.chatId || ""),
        messageId: String(message.messageId || "") || undefined,
        swipeId: Number.isInteger(Number(message.swipeId)) ? Number(message.swipeId) : undefined,
        imageIndex: Number.isInteger(Number(message.imageIndex)) ? Number(message.imageIndex) : undefined,
        imageId: String(message.imageId || "") || undefined,
        imageUrl: String(message.imageUrl || "") || undefined
      };
      try {
        const { updateInlayPromptData } = await import("./backend/stored-image-actions.js");
        const result = await updateInlayPromptData(request, message as Record<string, unknown>, userId);
        spindle.sendToFrontend({
          type: "inlay_image_edit_result",
          requestId,
          ok: true,
          operation: "update_inlay_prompt_data",
          details: result.details,
          record: { messageId: result.record.messageId, imageIds: result.record.imageIds, imageUrls: result.record.imageUrls, paragraphs: result.record.paragraphs },
          imageIndex: result.index
        } as unknown as Record<string, unknown>, userId);
      } catch (error) {
        spindle.sendToFrontend({
          type: "inlay_image_edit_result",
          requestId,
          ok: false,
          operation: "update_inlay_prompt_data",
          error: error instanceof Error ? error.message : String(error)
        } as unknown as Record<string, unknown>, userId);
      }
    } else if (message.type === "update_inlay_quote") {
      const requestId = String(message.requestId || "");
      const request: StoredImageActionRequest = {
        chatId: String(message.chatId || ""),
        messageId: String(message.messageId || "") || undefined,
        swipeId: Number.isInteger(Number(message.swipeId)) ? Number(message.swipeId) : undefined,
        imageIndex: Number.isInteger(Number(message.imageIndex)) ? Number(message.imageIndex) : undefined,
        imageId: String(message.imageId || "") || undefined,
        imageUrl: String(message.imageUrl || "") || undefined
      };
      try {
        const { updateInlayQuote } = await import("./backend/stored-image-actions.js");
        const result = await updateInlayQuote(request, message as Record<string, unknown>, userId);
        spindle.sendToFrontend({
          type: "inlay_image_edit_result",
          requestId,
          ok: true,
          operation: "update_inlay_quote",
          details: result.details,
          quote: result.details.quote,
          record: { messageId: result.record.messageId, imageIds: result.record.imageIds, imageUrls: result.record.imageUrls, paragraphs: result.record.paragraphs, quotes: result.record.quotes },
          imageIndex: result.index
        } as unknown as Record<string, unknown>, userId);
      } catch (error) {
        spindle.sendToFrontend({
          type: "inlay_image_edit_result",
          requestId,
          ok: false,
          operation: "update_inlay_quote",
          error: error instanceof Error ? error.message : String(error)
        } as unknown as Record<string, unknown>, userId);
      }
    } else if (message.type === "delete_inlay_image") {
      const requestId = String(message.requestId || "");
      const request: StoredImageActionRequest = {
        chatId: String(message.chatId || ""),
        messageId: String(message.messageId || "") || undefined,
        swipeId: Number.isInteger(Number(message.swipeId)) ? Number(message.swipeId) : undefined,
        imageIndex: Number.isInteger(Number(message.imageIndex)) ? Number(message.imageIndex) : undefined,
        imageId: String(message.imageId || "") || undefined,
        imageUrl: String(message.imageUrl || "") || undefined
      };
      try {
        const { deleteInlayImage } = await import("./backend/stored-image-actions.js");
        const result = await deleteInlayImage(request, userId);
        spindle.sendToFrontend({
          type: "inlay_image_edit_result",
          requestId,
          ok: true,
          operation: "delete_inlay_image",
          record: { messageId: result.record.messageId, imageIds: result.record.imageIds, imageUrls: result.record.imageUrls, paragraphs: result.record.paragraphs, prompts: result.record.prompts },
          deletedIndex: result.deletedIndex,
          imageIndex: result.index
        } as unknown as Record<string, unknown>, userId);
      } catch (error) {
        spindle.sendToFrontend({
          type: "inlay_image_edit_result",
          requestId,
          ok: false,
          operation: "delete_inlay_image",
          error: error instanceof Error ? error.message : String(error)
        } as unknown as Record<string, unknown>, userId);
      }
    } else if (message.type === "reroll_image_candidates") {
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
      const count = Number(message.count) || Number((config as unknown as Record<string, unknown>).imageRerollCount) || 1;
      const { generateRerollCandidates } = await import("./backend/generation.js");
      const result = await generateRerollCandidates(request, count, userId, config);
      spindle.sendToFrontend({
        type: "inlay_reroll_candidates",
        requestId: String(message.requestId || ""),
        ok: true,
        chatId,
        messageId: result.record.messageId,
        imageIndex: result.index,
        candidates: result.candidates
      }, userId);
    } else if (message.type === "reroll_image_apply") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      const candidate = message.candidate as { imageId: string; imageUrl: string; parameters: Record<string, unknown> } | undefined;
      if (!candidate || typeof candidate !== "object") throw new Error("Missing candidate image.");
      if (typeof candidate.imageUrl !== "string" || !candidate.imageUrl.trim()) throw new Error("Missing candidate image.");
      if (!candidate.parameters || typeof candidate.parameters !== "object" || Array.isArray(candidate.parameters)) throw new Error("Invalid candidate parameters.");
      if (candidate.imageId !== undefined && typeof candidate.imageId !== "string") throw new Error("Invalid candidate imageId.");
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
      const { applyRerollCandidate } = await import("./backend/generation.js");
      const result = await applyRerollCandidate(request, candidate, userId, config);
      spindle.sendToFrontend({
        type: "inlay_image_action_result",
        requestId: String(message.requestId || ""),
        operation: "reroll_apply",
        ok: true,
        chatId,
        messageId: result.record.messageId,
        imageIndex: result.index,
        imageUrl: result.record.imageUrls[result.index] || ""
      }, userId);
    } else if (message.type === "reroll_all_images") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(message.chatId || "");
      const messageId = String(message.messageId || "");
      const numericSwipe = Number(message.swipeId);
      const sidecar = message.sidecar === true;
      if (!chatId) throw new Error("Open the image's chat first.");
      // The floating action button may omit messageId: reroll the newest
      // assistant turn that has a stored generated record ("from this turn").
      let targetMessageId = messageId;
      let targetSwipeId: number | undefined = Number.isInteger(numericSwipe) ? numericSwipe : undefined;
      if (!targetMessageId) {
        const { findLatestGeneratedTurn } = await import("./backend/storage.js");
        const latest = await findLatestGeneratedTurn(chatId, userId);
        if (!latest) throw new Error("This chat has no generated illustrations yet.");
        targetMessageId = latest.messageId;
        targetSwipeId = latest.swipeId;
      } else if (targetSwipeId === undefined) {
        const key = `${chatId}:${targetMessageId}`;
        const { getState } = await import("./backend/storage.js");
        const state = await getState(chatId, userId);
        const match = Object.keys(state.generated)
          .filter((key) => key.startsWith(`${chatId}:${targetMessageId}:`))
          .sort()
          .at(-1);
        if (match) targetSwipeId = Number(match.split(":").at(-1)) || undefined;
      }
      spindle.sendToFrontend({ type: "status", status: sidecar ? "Rerunning sidecar for all images..." : "Rerolling all images...", busy: true }, userId);
      const { rerunAllStoredImages } = await import("./backend/generation.js");
      const result = await rerunAllStoredImages(chatId, targetMessageId, targetSwipeId, userId, config, sidecar);
      spindle.sendToFrontend({
        type: "inlay_reroll_all_result",
        requestId: String(message.requestId || ""),
        ok: true,
        sidecar,
        chatId,
        messageId: result.record.messageId,
        failedCount: result.failedCount,
        record: result.record
      }, userId);
      if (result.failedCount > 0) {
        spindle.sendToFrontend({ type: "status", status: `Rerolled with ${result.failedCount} failure(s) — prior images preserved`, record: result.record, busy: false }, userId);
      } else {
        spindle.sendToFrontend({ type: "status", status: sidecar ? "All sidecars rerun" : "All images rerolled", record: result.record, busy: false }, userId);
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
      spindle.sendToFrontend({ type: "status", status: actionLabel, busy: true }, userId);
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
      spindle.sendToFrontend({ type: "status", status: rerunSidecar ? "Sidecar rerun complete" : "Image rerolled", record: result.record, busy: false }, userId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStage(configForError || { debugLogging: true }, "frontend_message_error", { type: String(message.type || ""), error: errorMessage }, "error");
    spindle.log.error(errorMessage);
    if (message.type === "reroll_image" || message.type === "rerun_image_sidecar" || message.type === "reroll_image_candidates" || message.type === "reroll_image_apply" || message.type === "reroll_all_images") {
      const isCandidates = message.type === "reroll_image_candidates";
      const isApply = message.type === "reroll_image_apply";
      const isAll = message.type === "reroll_all_images";
      spindle.sendToFrontend({
        type: isCandidates ? "inlay_reroll_candidates" : isAll ? "inlay_reroll_all_result" : "inlay_image_action_result",
        requestId: String(message.requestId || ""),
        operation: message.type === "rerun_image_sidecar" ? "sidecar" : message.type === "reroll_image_apply" ? "reroll_apply" : message.type === "reroll_all_images" ? "reroll_all" : "reroll",
        ok: false,
        error: errorMessage
      } as unknown as Record<string, unknown>, userId);
    } else if (message.type === "update_inlay_prompt_data" || message.type === "update_inlay_quote" || message.type === "delete_inlay_image") {
      spindle.sendToFrontend({
        type: "inlay_image_edit_result",
        requestId: String(message.requestId || ""),
        ok: false,
        operation: String(message.type),
        error: errorMessage
      } as unknown as Record<string, unknown>, userId);
    } else if (message.type === "get_inlay_image_details") {
      spindle.sendToFrontend({
        type: "inlay_image_details_result",
        requestId: String(message.requestId || ""),
        ok: false,
        error: errorMessage
      } as unknown as Record<string, unknown>, userId);
    } else if (message.type === "set_quote_settings") {
      spindle.sendToFrontend({
        type: "quote_settings_updated",
        requestId: String(message.requestId || ""),
        chatId: String(message.chatId || ""),
        ok: false,
        error: errorMessage
      }, userId);
    } else if (message.type === "get_inlay_display_context") {
      spindle.sendToFrontend({
        type: "inlay_display_context",
        requestId: String(message.requestId || ""),
        chatId: String(message.chatId || ""),
        ok: false,
        error: errorMessage
      }, userId);
}
    spindle.sendToFrontend({ type: "status", status: "Error", error: errorMessage, busy: false }, userId);
  }
});

spindle.log.info("Inlay Illustrator loaded.");
