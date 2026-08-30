
import {
  getState,
  loadGeneratedRecord,
  storeGeneratedRecord,
  updateState,
  rebuildGeneratedImageIndex,
  getConfig
} from "./storage.js";
import { renderInlaidMessage } from "./rendering.js";
import { getConfig as getConfigFromStorage } from "./storage.js";
import type { GeneratedRecord, RawPromptData, State, ChatMessage } from "./types.js";
import type { Config } from "../shared/config.js";
import { logStage } from "./logging.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

export type StoredImageActionRequest = {
  chatId: string;
  messageId?: string;
  swipeId?: number;
  imageIndex?: number;
  imageId?: string;
  imageUrl?: string;
};

type Located = { key: string; record: GeneratedRecord; index: number };

function sameImageUrl(stored: string, requested: string): boolean {
  if (!stored || !requested) return false;
  return stored === requested || requested.endsWith(stored) || stored.endsWith(requested);
}

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isValidString(v: unknown, maxLen: number): boolean {
  return typeof v === "string" && v.length <= maxLen;
}

/**
 * Shared locator matching generation.ts robust semantics.
 * Uses direct image index via generatedImageIndex, exact chat/message/swipe key, then fallback scan.
 * Hydrate workflows = false per spec.
 * Handles stale index fallback to id/url and wrong message / missing record.
 */
export async function locateStoredInlayImage(
  state: State,
  request: StoredImageActionRequest,
  userId?: string
): Promise<Located> {
  const direct = request.imageId
    ? (state.generatedImageIndex as any)?.[`id:${request.imageId}`]
    : request.imageUrl
      ? (state.generatedImageIndex as any)?.[`url:${request.imageUrl}`]
      : undefined;
  const exactKey =
    request.messageId !== undefined && request.swipeId !== undefined
      ? `${request.chatId}:${request.messageId}:${request.swipeId}`
      : "";
  const candidates = [
    ...new Set(
      [
        (direct as any)?.key,
        exactKey && (state.generated as any)[exactKey] ? exactKey : undefined,
        ...Object.keys(state.generated)
      ].filter((v): v is string => Boolean(v))
    )
  ];
  for (const key of candidates) {
    const record = await loadGeneratedRecord((state.generated as any)[key], userId, false);
    if (!record || record.chatId !== request.chatId) continue;
    if (request.messageId && record.messageId !== request.messageId) continue;
    if (request.swipeId !== undefined && record.swipeId !== request.swipeId) continue;
    const preferredIndex = (direct as any)?.key === key ? (direct as any).index : request.imageIndex;
    if (
      preferredIndex !== undefined &&
      Number.isInteger(preferredIndex) &&
      preferredIndex >= 0 &&
      preferredIndex < record.imageUrls.length
    ) {
      const idMatches = !request.imageId || record.imageIds?.[preferredIndex] === request.imageId;
      const urlMatches = !request.imageUrl || sameImageUrl(record.imageUrls[preferredIndex] || "", request.imageUrl);
      if (idMatches && urlMatches) return { key, record, index: preferredIndex };
    }
    const matchedIndex = record.imageUrls.findIndex(
      (url, idx) =>
        (request.imageId && record.imageIds?.[idx] === request.imageId) ||
        (request.imageUrl && sameImageUrl(url, request.imageUrl))
    );
    if (matchedIndex >= 0) return { key, record, index: matchedIndex };
  }
  throw new Error("The selected image is not present in this chat's generated-image history.");
}

export type ExtendedDetails = {
  prompt: string;
  negativePrompt: string;
  quote: string;
  hasRawPromptData: boolean;
  rawPromptData?: RawPromptData | null;
  setup?: string;
  charPos?: string;
  charNeg?: string;
  supplement?: string;
  situation?: string;
  place?: string;
  camera?: string;
  action?: string;
};

export async function getInlayImageDetailsExtended(
  request: StoredImageActionRequest,
  userId?: string
): Promise<ExtendedDetails> {
  const state = await getState(request.chatId, userId);
  const located = await locateStoredInlayImage(state, request, userId);
  const raw: RawPromptData | undefined = located.record.rawPromptData?.[located.index];
  const hasRaw = !!raw;
  return {
    prompt: located.record.prompts[located.index] || "",
    negativePrompt: located.record.negativePrompts?.[located.index] || "",
    quote: located.record.quotes?.[located.index] || "",
    hasRawPromptData: hasRaw,
    rawPromptData: raw ?? null,
    setup: raw?.setup ?? "",
    charPos: raw?.charPos ?? "",
    charNeg: raw?.charNeg ?? "",
    supplement: raw?.supplement ?? "",
    situation: raw?.situation ?? "",
    place: raw?.place ?? "",
    camera: raw?.camera ?? "",
    action: raw?.action ?? ""
  };
}

// Validation helpers
const MAX_FIELD_LEN = 5000;
const MAX_QUOTE_LEN = 4000;
const MAX_CHATID_LEN = 512;
const MAX_IMAGEID_LEN = 2048;
const MAX_URL_LEN = 4096;

function validateRequest(request: StoredImageActionRequest): void {
  if (!request.chatId || typeof request.chatId !== "string") throw new Error("Missing chatId");
  if (request.chatId.length > MAX_CHATID_LEN) throw new Error("chatId too long");
  if (request.messageId !== undefined && typeof request.messageId !== "string") throw new Error("Invalid messageId");
  if (request.messageId && request.messageId.length > MAX_CHATID_LEN) throw new Error("messageId too long");
  if (request.swipeId !== undefined && (!Number.isInteger(request.swipeId) || request.swipeId < 0)) throw new Error("Invalid swipeId");
  if (request.imageIndex !== undefined && (!Number.isInteger(request.imageIndex) || request.imageIndex < 0)) throw new Error("Invalid imageIndex");
  if (request.imageId !== undefined && typeof request.imageId !== "string") throw new Error("Invalid imageId");
  if (request.imageId && request.imageId.length > MAX_IMAGEID_LEN) throw new Error("imageId too long");
  if (request.imageUrl !== undefined && typeof request.imageUrl !== "string") throw new Error("Invalid imageUrl");
  if (request.imageUrl && request.imageUrl.length > MAX_URL_LEN) throw new Error("imageUrl too long");
  // require at least one locator besides chatId?
  if (
    request.messageId === undefined &&
    request.swipeId === undefined &&
    request.imageIndex === undefined &&
    request.imageId === undefined &&
    request.imageUrl === undefined
  ) {
    // allow but will fail locate -> throw appropriate
  }
}

function assertNoRawInjection(payload: Record<string, unknown>): void {
  const forbidden = ["rawPromptData", "raw", "rawJson", "workflow", "imageParameters"];
  for (const key of forbidden) {
    if (key in payload) {
      const val = (payload as any)[key];
      if (val !== undefined && val !== null && typeof val === "object") {
        throw new Error("Invalid payload: raw object injection not allowed");
      }
      if (typeof val === "string" && key === "rawPromptData") throw new Error("Invalid payload: raw object injection not allowed");
    }
  }
  // also check nested injection via setup etc being object?
}

// Update prompt data
export async function updateInlayPromptData(
  request: StoredImageActionRequest,
  payload: Record<string, unknown>,
  userId?: string
): Promise<{ details: ExtendedDetails; record: GeneratedRecord; index: number }> {
  validateRequest(request);
  assertNoRawInjection(payload);
  // Extract fields: support setup, charPos/pos, charNeg/neg, supplement/sup
  const setupRaw = (payload as any).setup;
  const charPosRaw = (payload as any).charPos ?? (payload as any).pos ?? (payload as any).charPosRaw;
  const charNegRaw = (payload as any).charNeg ?? (payload as any).neg;
  const supplementRaw = (payload as any).supplement ?? (payload as any).sup;

  const setup = typeof setupRaw === "string" ? setupRaw : "";
  const charPos = typeof charPosRaw === "string" ? charPosRaw : "";
  const charNeg = typeof charNegRaw === "string" ? charNegRaw : "";
  const supplement = typeof supplementRaw === "string" ? supplementRaw : "";

  // if payload had missing fields but had other types? treat non-string as error if present
  if (setupRaw !== undefined && typeof setupRaw !== "string") throw new Error("Invalid setup");
  if ((payload as any).charPos !== undefined && typeof (payload as any).charPos !== "string") throw new Error("Invalid charPos");
  if ((payload as any).pos !== undefined && typeof (payload as any).pos !== "string") throw new Error("Invalid pos");
  if ((payload as any).charNeg !== undefined && typeof (payload as any).charNeg !== "string") throw new Error("Invalid charNeg");
  if ((payload as any).neg !== undefined && typeof (payload as any).neg !== "string") throw new Error("Invalid neg");
  if ((payload as any).supplement !== undefined && typeof (payload as any).supplement !== "string") throw new Error("Invalid supplement");
  if ((payload as any).sup !== undefined && typeof (payload as any).sup !== "string") throw new Error("Invalid sup");

  if (setup.length > MAX_FIELD_LEN) throw new Error("setup too long");
  if (charPos.length > MAX_FIELD_LEN) throw new Error("charPos too long");
  if (charNeg.length > MAX_FIELD_LEN) throw new Error("charNeg too long");
  if (supplement.length > MAX_FIELD_LEN) throw new Error("supplement too long");

  let locatedKey = "";
  let locatedIndex = -1;
  let updatedRecord: any = null;

  const config = await getConfigFromStorage(userId);

  await updateState(request.chatId, userId, async (state) => {
    const located = await locateStoredInlayImage(state, request, userId);
    locatedKey = located.key;
    locatedIndex = located.index;
    const rec = located.record;
    if (!rec.rawPromptData || !rec.rawPromptData[located.index]) {
      throw new Error("Prompt data is unavailable for this image. Raw prompt was not stored.");
    }
    const existingRaw = rec.rawPromptData[located.index];
    const nextRaw: RawPromptData = {
      setup,
      charPos,
      charNeg,
      supplement,
      situation: existingRaw.situation ?? "",
      place: existingRaw.place ?? "",
      camera: existingRaw.camera ?? "",
      action: existingRaw.action ?? ""
    };
    const nextRawData = [...rec.rawPromptData];
    nextRawData[located.index] = nextRaw;
    updatedRecord = {
      ...rec,
      rawPromptData: nextRawData
    };
    state.generated[located.key] = await storeGeneratedRecord(request.chatId, located.key, updatedRecord!, userId);
    rebuildGeneratedImageIndex(state);
  });

  if (!updatedRecord || locatedIndex < 0) throw new Error("Failed to persist prompt update");
  // No chat rerender for prompt edit per spec: future rerolls will use edited raw.
  // But we should log stage.
  logStage(config, "inlay_prompt_updated", { chatId: request.chatId, key: locatedKey, index: locatedIndex });
  const details: ExtendedDetails = {
    prompt: updatedRecord.prompts[locatedIndex] || "",
    negativePrompt: updatedRecord.negativePrompts?.[locatedIndex] || "",
    quote: updatedRecord.quotes?.[locatedIndex] || "",
    hasRawPromptData: true,
    rawPromptData: (updatedRecord.rawPromptData as RawPromptData[])[locatedIndex],
    setup,
    charPos,
    charNeg,
    supplement,
    situation: (updatedRecord.rawPromptData as RawPromptData[])[locatedIndex].situation,
    place: (updatedRecord.rawPromptData as RawPromptData[])[locatedIndex].place,
    camera: (updatedRecord.rawPromptData as RawPromptData[])[locatedIndex].camera,
    action: (updatedRecord.rawPromptData as RawPromptData[])[locatedIndex].action
  };
  return { details, record: updatedRecord, index: locatedIndex };
}

export async function updateInlayQuote(
  request: StoredImageActionRequest,
  payload: Record<string, unknown>,
  userId?: string
): Promise<{ details: ExtendedDetails; record: GeneratedRecord; index: number }> {
  validateRequest(request);
  assertNoRawInjection(payload);
  const rawQuote = (payload as any).quote;
  if (rawQuote !== undefined && typeof rawQuote !== "string") throw new Error("Invalid quote");
  const quote = typeof rawQuote === "string" ? rawQuote : "";
  if (quote.length > MAX_QUOTE_LEN) throw new Error("quote too long");

  let locatedKey = "";
  let locatedIndex = -1;
  let updatedRecord: any = null;
  const config = await getConfigFromStorage(userId);

  // State write before chat rerender
  await updateState(request.chatId, userId, async (state) => {
    const located = await locateStoredInlayImage(state, request, userId);
    locatedKey = located.key;
    locatedIndex = located.index;
    const rec = located.record;
    const currentQuotes = rec.quotes ? [...rec.quotes] : Array(rec.imageUrls.length).fill("");
    // ensure length
    while (currentQuotes.length < rec.imageUrls.length) currentQuotes.push("");
    while (currentQuotes.length <= located.index) currentQuotes.push("");
    currentQuotes[located.index] = quote;
    updatedRecord = { ...rec, quotes: currentQuotes };
    state.generated[located.key] = await storeGeneratedRecord(request.chatId, located.key, updatedRecord!, userId);
    rebuildGeneratedImageIndex(state);
  });

  if (!updatedRecord || locatedIndex < 0) throw new Error("Failed to persist quote update");

  // Immediate rerender: storage remains changed even if chat update fails (quirk)
  try {
    const messages = (await (spindle as any).chat.getMessages(request.chatId)) as ChatMessage[];
    const target = messages.find((m) => m.id === updatedRecord!.messageId);
    if (!target) throw new Error("The source assistant message no longer exists.");
    const nextContent = renderInlaidMessage(String(target.content || ""), updatedRecord!, config);
    await (spindle as any).chat.updateMessage(request.chatId, updatedRecord!.messageId, {
      content: nextContent,
      metadata: {
        ...(target.metadata || {}),
        inlayIllustratorImageIds: updatedRecord!.imageIds,
        inlayIllustratorParagraphs: updatedRecord!.paragraphs,
        inlayIllustratorGeneratedAt: updatedRecord!.createdAt
      }
    });
  } catch (e) {
    // Keep storage changed, propagate or swallow? Spec says storage remains changed on chat update failure; backend should still return ok with updated record? But we should surface error? Original failure quirk adaptation consistent suggests we still return success for storage but chat update failure should still be ok? However we should not hide chat failure totally - maybe just log.
    // For now, if update fails, we still return success for storage change, but we can log.
    logStage(config, "inlay_quote_chat_update_failed", { error: e instanceof Error ? e.message : String(e) }, "warn");
    // Do not throw - return storage success.
  }

  const raw = updatedRecord!.rawPromptData?.[locatedIndex];
  const details: ExtendedDetails = {
    prompt: updatedRecord!.prompts[locatedIndex] || "",
    negativePrompt: updatedRecord!.negativePrompts?.[locatedIndex] || "",
    quote,
    hasRawPromptData: !!raw,
    rawPromptData: raw ?? null,
    setup: raw?.setup ?? "",
    charPos: raw?.charPos ?? "",
    charNeg: raw?.charNeg ?? "",
    supplement: raw?.supplement ?? "",
    situation: raw?.situation ?? "",
    place: raw?.place ?? "",
    camera: raw?.camera ?? "",
    action: raw?.action ?? ""
  };
  logStage(config, "inlay_quote_updated", { chatId: request.chatId, key: locatedKey, index: locatedIndex });
  return { details, record: updatedRecord!, index: locatedIndex };
}

function removeAtNullable<T>(arr: T[] | undefined, index: number): T[] | undefined {
  if (!arr) return undefined;
  if (index < 0 || index >= arr.length) return arr;
  return [...arr.slice(0, index), ...arr.slice(index + 1)];
}

export async function deleteInlayImage(
  request: StoredImageActionRequest,
  userId?: string
): Promise<{ details?: ExtendedDetails; record: GeneratedRecord; index: number; deletedIndex: number }> {
  validateRequest(request);
  let locatedKey = "";
  let deletedIdx = -1;
  let updatedRecord: any = null;
  const config = await getConfigFromStorage(userId);

  await updateState(request.chatId, userId, async (state) => {
    const located = await locateStoredInlayImage(state, request, userId);
    locatedKey = located.key;
    deletedIdx = located.index;
    const rec = located.record;
    const idx = located.index;
    // Build new arrays removing at idx for all parallel fields
    const nextPrompts = rec.prompts ? [...rec.prompts.slice(0, idx), ...rec.prompts.slice(idx + 1)] : [];
    const nextNegative = rec.negativePrompts ? removeAtNullable(rec.negativePrompts, idx) : undefined;
    const nextQuotes = rec.quotes ? removeAtNullable(rec.quotes, idx) : undefined;
    const nextParams = rec.imageParameters ? removeAtNullable(rec.imageParameters, idx) : undefined;
    const nextCore = rec.corePrompts ? removeAtNullable(rec.corePrompts, idx) : undefined;
    const nextShotNeg = rec.shotNegatives ? removeAtNullable(rec.shotNegatives, idx) : undefined;
    const nextFormats = rec.promptFormats ? removeAtNullable(rec.promptFormats, idx) : undefined;
    const nextParas = rec.paragraphs ? [...rec.paragraphs.slice(0, idx), ...rec.paragraphs.slice(idx + 1)] : [];
    const nextIds = rec.imageIds ? [...rec.imageIds.slice(0, idx), ...rec.imageIds.slice(idx + 1)] : [];
    const nextUrls = rec.imageUrls ? [...rec.imageUrls.slice(0, idx), ...rec.imageUrls.slice(idx + 1)] : [];
    const nextRaw = rec.rawPromptData ? removeAtNullable(rec.rawPromptData, idx) : undefined;

    const rebuilt: GeneratedRecord = {
      ...rec,
      prompts: nextPrompts,
      negativePrompts: nextNegative ?? [],
      quotes: nextQuotes ?? [],
      imageParameters: nextParams ?? [],
      corePrompts: nextCore ?? [],
      shotNegatives: nextShotNeg ?? [],
      promptFormats: nextFormats ?? [],
      paragraphs: nextParas,
      imageIds: nextIds,
      imageUrls: nextUrls,
      rawPromptData: nextRaw as any,
      // keep createdAt etc
    };
    // If all optional arrays now empty, keep as empty arrays (valid empty record)
    // Ensure optional arrays that were undefined stay undefined unless they had content? But spec says remove from ALL arrays, including optional when present.
    // For empty record we keep empty arrays for consistency.
    // Need to handle that storeGeneratedRecord expects certain shapes: We'll ensure required fields are arrays.
    // Remove rawPromptData key if it becomes empty and original had none? Keep if nextRaw defined else omit
    if (nextRaw === undefined) {
      delete (rebuilt as any).rawPromptData;
    } else if (nextRaw.length === 0) {
      rebuilt.rawPromptData = [];
    }
    // Ensure empty arrays still valid
    if ((rebuilt.negativePrompts as any)?.length === 0 && !rec.negativePrompts) delete (rebuilt as any).negativePrompts;
    if ((rebuilt.quotes as any)?.length === 0 && !rec.quotes) delete (rebuilt as any).quotes;

    updatedRecord = rebuilt;
    state.generated[located.key] = await storeGeneratedRecord(request.chatId, located.key, rebuilt, userId);
    rebuildGeneratedImageIndex(state);
  });

  if (!updatedRecord) throw new Error("Failed to persist deletion");

  // Rerender message: storage already changed even if this fails
  try {
    const messages = (await (spindle as any).chat.getMessages(request.chatId)) as ChatMessage[];
    const target = messages.find((m) => m.id === updatedRecord!.messageId);
    if (!target) throw new Error("The source assistant message no longer exists.");
    const nextContent = renderInlaidMessage(String(target.content || ""), updatedRecord!, config);
    await (spindle as any).chat.updateMessage(request.chatId, updatedRecord!.messageId, {
      content: nextContent,
      metadata: {
        ...(target.metadata || {}),
        inlayIllustratorImageIds: updatedRecord!.imageIds,
        inlayIllustratorParagraphs: updatedRecord!.paragraphs,
        inlayIllustratorGeneratedAt: updatedRecord!.createdAt
      }
    });
  } catch (e) {
    logStage(config, "inlay_delete_chat_update_failed", { error: e instanceof Error ? e.message : String(e) }, "warn");
    // storage remains changed, still return success? Spec says on chat update failure storage remains changed (original failure quirk) -> we still return ok for storage.
  }

  logStage(config, "inlay_delete_done", { chatId: request.chatId, key: locatedKey, deletedIndex: deletedIdx, remaining: updatedRecord!.imageUrls.length });
  return { record: updatedRecord!, index: deletedIdx, deletedIndex: deletedIdx };
}
