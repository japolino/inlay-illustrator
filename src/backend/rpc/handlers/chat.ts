/**
 * RPC handlers owned by the `pipeline` module: generation.*, history.*, zoom.*, chatState.*, chatDom.* (see ./index.ts).
 * Every handler delegates to `ctx.modules.pipeline` (src/backend/pipeline/controller.ts).
 */
import { fail } from "../errors.js";
import type { HandlerGroup, RpcContext } from "../types.js";
import type { ChatPipeline } from "../../pipeline/index.js";

function pipelineOf(ctx: RpcContext): ChatPipeline {
  const pipeline = (ctx.modules as { pipeline?: ChatPipeline }).pipeline;
  if (!pipeline) fail("unsupported", "The chat pipeline is not available.");
  return pipeline;
}

function need(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) fail("bad-request", `${name} is required.`);
  return value.trim();
}

const OK = { ok: true } as const;

export const chatHandlers: HandlerGroup = {
  /* generation */
  "generation.start": (params, ctx) => pipelineOf(ctx).start(params),
  "generation.cancel": (params, ctx) => {
    pipelineOf(ctx).cancel(params);
    return OK;
  },
  "generation.retry": (params, ctx) => pipelineOf(ctx).retry(need(params.jobId, "jobId")),
  "generation.restart": (params, ctx) => pipelineOf(ctx).restart(need(params.jobId, "jobId")),
  "generation.dismiss": (params, ctx) => {
    pipelineOf(ctx).dismiss(need(params.jobId, "jobId"));
    return OK;
  },
  "generation.listActive": (params, ctx) => ({ jobs: pipelineOf(ctx).listActive(params.chatId) }),
  "generation.regenerateSlot": (params, ctx) =>
    pipelineOf(ctx).regenerateSlot({
      chatId: need(params.chatId, "chatId"),
      messageKey: need(params.messageKey, "messageKey"),
      slotId: need(params.slotId, "slotId"),
      ...(params.entryId ? { entryId: params.entryId } : {}),
      ...(params.overrides ? { overrides: params.overrides } : {}),
    }),

  /* history */
  "history.get": (params, ctx) => pipelineOf(ctx).getHistory(need(params.chatId, "chatId"), params.messageKeys),
  "history.selectEntry": async (params, ctx) => {
    await pipelineOf(ctx).selectEntry(need(params.chatId, "chatId"), need(params.slotId, "slotId"), need(params.entryId, "entryId"));
    return OK;
  },
  "history.selectRevision": async (params, ctx) => {
    await pipelineOf(ctx).selectRevision(need(params.chatId, "chatId"), need(params.messageKey, "messageKey"), need(params.revisionId, "revisionId"));
    return OK;
  },
  "history.deleteEntry": (params, ctx) => pipelineOf(ctx).deleteEntry(need(params.chatId, "chatId"), need(params.entryId, "entryId")),
  "history.prepareSlotDeletion": (params, ctx) =>
    pipelineOf(ctx).prepareSlotDeletion(need(params.chatId, "chatId"), need(params.messageKey, "messageKey"), need(params.slotId, "slotId")),
  "history.deleteSlot": (params, ctx) => pipelineOf(ctx).deleteSlot(need(params.previewToken, "previewToken")),
  "history.retryCleanup": (params, ctx) => pipelineOf(ctx).retryCleanup(need(params.cleanupId, "cleanupId")),

  /* zoom */
  "zoom.getDetails": (params, ctx) => pipelineOf(ctx).getZoomDetails(need(params.chatId, "chatId"), need(params.slotId, "slotId"), params.entryId || undefined),
  "zoom.saveDraft": (params, ctx) => pipelineOf(ctx).saveDraft(need(params.chatId, "chatId"), need(params.slotId, "slotId"), params.overrides ?? {}),
  "zoom.clearDraft": (params, ctx) => {
    if (params.part !== "prompts" && params.part !== "coordinates" && params.part !== "all") fail("bad-request", "part must be prompts, coordinates or all.");
    return pipelineOf(ctx).clearDraft(need(params.chatId, "chatId"), need(params.slotId, "slotId"), params.part);
  },
  "zoom.importViewed": (params, ctx) => {
    if (params.what !== "prompts" && params.what !== "seed") fail("bad-request", "what must be prompts or seed.");
    return pipelineOf(ctx).importViewed(need(params.chatId, "chatId"), need(params.slotId, "slotId"), need(params.entryId, "entryId"), params.what);
  },
  "zoom.requestAiPromptEdit": (params, ctx) =>
    pipelineOf(ctx).requestAiPromptEdit(need(params.chatId, "chatId"), need(params.slotId, "slotId"), need(params.entryId, "entryId"), params.request ?? { instruction: "", imageToImage: false }),
  "zoom.applyAiPromptEdit": (params, ctx) => pipelineOf(ctx).applyAiPromptEdit(need(params.chatId, "chatId"), need(params.slotId, "slotId"), need(params.proposalId, "proposalId")),

  /* chat state window */
  "chatState.get": (params, ctx) => pipelineOf(ctx).getChatState(need(params.chatId, "chatId")),
  "chatState.clear": (params, ctx) => pipelineOf(ctx).clearChatState(need(params.chatId, "chatId"), params.actorKeys),
  "chatState.set": (params, ctx) => {
    if (!Number.isSafeInteger(params.baseRevision)) fail("bad-request", "baseRevision is required.");
    return pipelineOf(ctx).setChatState(need(params.chatId, "chatId"), params.actorState, params.baseRevision);
  },

  /* chat DOM */
  "chatDom.getMessageStates": (params, ctx) => pipelineOf(ctx).getMessageStates(need(params.chatId, "chatId"), params.messageIds),
};
