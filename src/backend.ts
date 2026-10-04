/**
 * Inlay Illustrator backend (Asset Maid port skeleton).
 *
 * Kept host integration only:
 * - the interceptor that strips our inlay markup before every LLM request,
 * - a minimal frontend message router (state, config, gallery, image details),
 * - the avatar / image-bytes bridge responses.
 * Automatic illustration is not wired yet; the Asset Maid pipeline will plug
 * into this router (see docs/ARCHITECTURE.md).
 */
import type { Config } from "./shared/config.js";
import { acceptAvatarImageResponse } from "./backend/avatar-image-bridge.js";
import { stripInlayFromMessages } from "./backend/inlay-content.js";
import { findLegacyImage, listInlayGallery } from "./backend/legacy-records.js";
import { logStage } from "./backend/logging.js";
import { getConfig, sendState, setConfig } from "./backend/storage.js";
import { keysOf } from "./backend/utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

spindle.registerInterceptor(async (messages) => stripInlayFromMessages(messages));

function optionalInteger(value: unknown, minimum = 0): number | undefined {
  const parsed = Number(value);
  return value !== undefined && value !== null && value !== "" && Number.isInteger(parsed) && parsed >= minimum ? parsed : undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handleFrontendMessage(message: Record<string, unknown>, userId: string): Promise<void> {
  const chatId = String(message.chatId || "");
  switch (message.type) {
    case "get_state": {
      const config = await getConfig(userId);
      logStage(config, "frontend_get_state", { chatId: chatId || null });
      await sendState(userId, chatId, config);
      return;
    }
    case "set_config": {
      const patch = (message.patch && typeof message.patch === "object" ? message.patch : {}) as Partial<Config>;
      const next = await setConfig(patch, userId);
      logStage(next, "frontend_set_config", { patchKeys: keysOf(patch) });
      spindle.sendToFrontend({ type: "config_updated", chatId, config: next }, userId);
      return;
    }
    case "get_inlay_image_details": {
      const requestId = String(message.requestId || "");
      try {
        const found = await findLegacyImage({
          chatId,
          messageId: String(message.messageId || "") || undefined,
          swipeId: optionalInteger(message.swipeId),
          imageIndex: optionalInteger(message.imageIndex),
          imageId: String(message.imageId || "") || undefined,
          imageUrl: String(message.imageUrl || "") || undefined
        }, userId);
        if (!found) throw new Error("No stored details for this image.");
        const slot = found.record.slots[found.index]!;
        spindle.sendToFrontend({
          type: "inlay_image_details_result",
          requestId,
          ok: true,
          prompt: slot.prompt,
          negativePrompt: slot.negativePrompt,
          perspectiveMode: slot.perspectiveMode,
          perspectiveSource: slot.perspectiveSource,
          creativeConcept: slot.creativeConcept
        }, userId);
      } catch (error) {
        spindle.sendToFrontend({ type: "inlay_image_details_result", requestId, ok: false, error: errorText(error) }, userId);
      }
      return;
    }
    case "list_inlay_gallery": {
      const requestId = String(message.requestId || "");
      const page = Math.max(1, Math.floor(Number(message.page)) || 1);
      const selectedChatId = typeof message.selectedChatId === "string" && message.selectedChatId.trim()
        ? message.selectedChatId.trim()
        : undefined;
      try {
        const result = await listInlayGallery(userId, page, selectedChatId);
        spindle.sendToFrontend({ type: "inlay_gallery_result", requestId, ok: true, ...result }, userId);
      } catch (error) {
        spindle.sendToFrontend({ type: "inlay_gallery_result", requestId, ok: false, error: errorText(error) }, userId);
      }
      return;
    }
    default:
      return;
  }
}

spindle.onFrontendMessage(async (payload: unknown, userId) => {
  const message = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  if (acceptAvatarImageResponse(message)) return;
  try {
    await handleFrontendMessage(message, userId);
  } catch (error) {
    const text = errorText(error);
    logStage({ debugLogging: true }, "frontend_message_error", { type: String(message.type || ""), error: text }, "error");
    spindle.sendToFrontend({ type: "status", chatId: String(message.chatId || ""), status: "Error", error: text }, userId);
  }
});

spindle.log.info("Inlay Illustrator loaded.");
