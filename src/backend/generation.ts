import type { Config } from "../shared/config.js";
import {
  buildFullLorebookSnapshot,
  buildLorebookContextSnapshot,
  buildParserContext,
  isOwnMessage,
  loadParserContextSources,
  type LorebookContextSnapshot
} from "./context.js";
import { buildImageParameters, prepareAndDispatchImageJobs, rerollImageParameters, resolveImageConnection } from "./images.js";
import { logStage } from "./logging.js";
import { updateCharacterMemory } from "./memory.js";
import { ignoredTagNames, paragraphCount, prepareParagraphs } from "./paragraphs.js";
import {
  buildParserMessages,
  parsePayloadWithRepair,
  preprocessTargetParagraphs,
  resolveParserConnection
} from "./parser.js";
import { getFinalPromptsForGeneration } from "./prompt.js";
import { imageUrlFromId, renderInlaidMessage } from "./rendering.js";
import { normalizeScenePayload, selectPromptEntries } from "./scenes.js";
import {
  getConfig,
  getState,
  loadGeneratedRecord,
  migrateLegacyGeneratedRecords,
  rebuildGeneratedImageIndex,
  storeGeneratedRecord,
  updateState
} from "./storage.js";
import { tryAcquireRuntimeLock } from "./runtime-lock.js";
import type {
  ChatMessage,
  GeneratedRecord,
  ImageConnection,
  ParsedPayload,
  PreparedImageJob,
  PreparedParagraph,
  PromptEntry,
  RawPromptData,
  State
} from "./types.js";
import { cleanArray, cleanString, keysOf } from "./utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

type ImageGenerationResult = Awaited<ReturnType<typeof spindle.imageGen.generate>>;
type ParsedSelection = { parsed: ParsedPayload; selected: PromptEntry[]; snapshot: LorebookContextSnapshot };
type PreparedImageStage = { jobs: PreparedImageJob[]; results: ImageGenerationResult[] };
type ImageAssets = {
  prompts: string[];
  negativePrompts: string[];
  quotes: string[];
  imageParameters: Array<Record<string, unknown>>;
  corePrompts: string[];
  shotNegatives: string[];
  promptFormats: Array<"legacy" | "ordered">;
  paragraphs: number[];
  imageIds: string[];
  imageUrls: string[];
  rawPromptData: RawPromptData[];
};

export type ParseStageInput = {
  chatId: string;
  messageId: string;
  messages: ChatMessage[];
  paragraphs: PreparedParagraph[];
  state: State;
  config: Config;
  userId?: string;
};

type PersistStageInput = {
  chatId: string;
  messageId: string;
  swipeId: number;
  key: string;
  target: ChatMessage;
  parsed: ParsedPayload;
  assets: ImageAssets;
  config: Config;
  userId?: string;
};

export type StoredImageActionRequest = {
  chatId: string;
  messageId?: string;
  swipeId?: number;
  imageIndex?: number;
  imageId?: string;
  imageUrl?: string;
};

export type StoredImageDetails = {
  prompt: string;
  negativePrompt: string;
  quote: string;
};

type LocatedGeneratedImage = { key: string; record: GeneratedRecord; index: number };

function generatedRecord(value: unknown): GeneratedRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GeneratedRecord>;
  return Array.isArray(candidate.prompts) && Array.isArray(candidate.paragraphs) && Array.isArray(candidate.imageUrls)
    && typeof candidate.messageId === "string"
    ? candidate as GeneratedRecord
    : null;
}

function sameImageUrl(stored: string, requested: string): boolean {
  if (!stored || !requested) return false;
  return stored === requested || requested.endsWith(stored) || stored.endsWith(requested);
}

export function locateGeneratedImage(state: State, request: StoredImageActionRequest): LocatedGeneratedImage {
  for (const [key, value] of Object.entries(state.generated)) {
    const record = generatedRecord(value);
    if (!record || record.chatId !== request.chatId) continue;
    if (request.messageId && record.messageId !== request.messageId) continue;
    if (request.swipeId !== undefined && record.swipeId !== request.swipeId) continue;
    const explicitIndex = request.imageIndex;
    if (explicitIndex !== undefined && Number.isInteger(explicitIndex) && explicitIndex >= 0 && explicitIndex < record.imageUrls.length) {
      const idMatches = !request.imageId || record.imageIds?.[explicitIndex] === request.imageId;
      const urlMatches = !request.imageUrl || sameImageUrl(record.imageUrls[explicitIndex] || "", request.imageUrl);
      if (idMatches && urlMatches) return { key, record, index: explicitIndex };
    }
    const matchedIndex = record.imageUrls.findIndex((url, index) =>
      (request.imageId && record.imageIds?.[index] === request.imageId)
      || (request.imageUrl && sameImageUrl(url, request.imageUrl))
    );
    if (matchedIndex >= 0) return { key, record, index: matchedIndex };
  }
  throw new Error("The selected image is not present in this chat's generated-image history.");
}

async function locateStoredGeneratedImage(
  state: State,
  request: StoredImageActionRequest,
  userId?: string,
  hydrateWorkflows = true
): Promise<LocatedGeneratedImage> {
  const direct = request.imageId ? state.generatedImageIndex?.[`id:${request.imageId}`]
    : request.imageUrl ? state.generatedImageIndex?.[`url:${request.imageUrl}`]
      : undefined;
  const exactKey = request.messageId && request.swipeId !== undefined
    ? `${request.chatId}:${request.messageId}:${request.swipeId}`
    : "";
  const candidates = [...new Set([
    direct?.key,
    exactKey && state.generated[exactKey] ? exactKey : undefined,
    ...Object.keys(state.generated)
  ].filter((value): value is string => Boolean(value)))];
  for (const key of candidates) {
    const record = await loadGeneratedRecord(state.generated[key], userId, hydrateWorkflows);
    if (!record || record.chatId !== request.chatId) continue;
    if (request.messageId && record.messageId !== request.messageId) continue;
    if (request.swipeId !== undefined && record.swipeId !== request.swipeId) continue;
    const preferredIndex = direct?.key === key ? direct.index : request.imageIndex;
    if (preferredIndex !== undefined && Number.isInteger(preferredIndex)
      && preferredIndex >= 0 && preferredIndex < record.imageUrls.length) {
      const idMatches = !request.imageId || record.imageIds?.[preferredIndex] === request.imageId;
      const urlMatches = !request.imageUrl || sameImageUrl(record.imageUrls[preferredIndex] || "", request.imageUrl);
      if (idMatches && urlMatches) return { key, record, index: preferredIndex };
    }
    const matchedIndex = record.imageUrls.findIndex((url, index) =>
      (request.imageId && record.imageIds?.[index] === request.imageId)
      || (request.imageUrl && sameImageUrl(url, request.imageUrl))
    );
    if (matchedIndex >= 0) return { key, record, index: matchedIndex };
  }
  throw new Error("The selected image is not present in this chat's generated-image history.");
}

export async function getStoredImageDetails(
  request: StoredImageActionRequest,
  userId?: string
): Promise<StoredImageDetails> {
  const state = await getState(request.chatId, userId);
  const located = await locateStoredGeneratedImage(state, request, userId, false);
  return {
    prompt: located.record.prompts[located.index] || "",
    negativePrompt: located.record.negativePrompts?.[located.index] || "",
    quote: located.record.quotes?.[located.index] || ""
  };
}

function replaceAt<T>(values: T[] | undefined, index: number, value: T, fallback: T): T[] {
  const next = [...(values || [])];
  while (next.length <= index) next.push(fallback);
  next[index] = value;
  return next;
}

// Removed non-original retry classification and backoff helpers — original retries every failure immediately, no exponential delay/jitter.

export async function parseAndSelectPrompts(input: ParseStageInput): Promise<ParsedSelection> {
  const { chatId, messageId, messages, paragraphs, state, config, userId } = input;
  const targetIndex = Math.max(0, messages.findIndex((message) => message.id === messageId));
  // Resolve the activated-entry lorebook snapshot once (cheap: 1 ranked call + <=24
  // entry fetches). Feeds Card.* instructions, the lb-xnai.lb.extra / Inlay.extra
  // override, and — when includeLorebook is on — the parser context blocks.
  const fullSnapshotPromise = buildFullLorebookSnapshot(chatId, userId);
  const [parserConnection, lorebookSnapshot, contextSources] = await Promise.all([
    resolveParserConnection(config, userId),
    fullSnapshotPromise,
    loadParserContextSources(chatId, config, userId)
  ]);
  const effectiveSnapshotForContext = lorebookSnapshot;

  const buildPreprocessingContextForAttempt = async (attempt: number) =>
    buildParserContext(
      chatId,
      messages,
      targetIndex,
      state.characterAppearance,
      config,
      attempt,
      userId,
      effectiveSnapshotForContext,
      undefined,
      contextSources
    );
  const preprocessingResult = await preprocessTargetParagraphs(null, config, paragraphs, buildPreprocessingContextForAttempt, userId, lorebookSnapshot);

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= config.parserRetries; attempt += 1) {
    try {
      const context = await buildParserContext(
        chatId,
        messages,
        targetIndex,
        state.characterAppearance,
        config,
        attempt,
        userId,
        effectiveSnapshotForContext,
        undefined,
        contextSources
      );
      // Pass preprocessingResult (text+used) so header is chosen by used boolean, not shape
      const parserMessagesList = buildParserMessages(config, context, preprocessingResult, userId, lorebookSnapshot);
      logStage(config, "parser_prompt_built", {
        attempt,
        systemContextLength: context.systemContext.length,
        recentContextLength: context.recentContext.length,
        overrideLength: context.override.length,
        parserParagraphs: paragraphs.length,
        cacheCharacters: Object.keys(state.characterAppearance).length,
        promptStyle: config.promptStyle,
        promptSyntax: config.promptSyntax,
        mode: config.mode,
        maxCharacters: config.mode === "asset" ? 1 : config.maxCharacters,
        preprocessingMode: config.preprocessingMode,
        prefillEnabled: config.prefillEnabled,
        contextDiagnostics: context.diagnostics,
        messageCount: messages.length
      });
      const parsed = await parsePayloadWithRepair(
        parserConnection,
        config,
        parserMessagesList,
        userId
      );
      // Original success is scenes && #scenes>0 — parsePayloadWithRepair already enforces that.
      // Do NOT validate allowed-P or structural issues; do NOT retry merely because shots later select to zero.
      const selected = selectPromptEntries(parsed, paragraphs, config);
      // For main pipeline, empty selected is allowed (preserves original no-image completion); sidecar caller will handle empty honestly.
      return { parsed, selected, snapshot: lorebookSnapshot };
    } catch (error) {
      lastError = error;
      logStage(config, "parser_attempt_failed", {
        attempt,
        retries: config.parserRetries,
        error: error instanceof Error ? error.message : String(error)
      }, attempt >= config.parserRetries ? "error" : "warn");
      if (attempt >= config.parserRetries) throw error;
      // No classification, no delay — immediate retry, context include count grows via buildParserContext attempt+1
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Parser did not return usable prompts.");
}

async function persistCharacterMemory(
  chatId: string,
  parsed: ParsedPayload,
  config: Config,
  userId?: string
): Promise<void> {
  const committed = await updateState(chatId, userId, (state) => {
    updateCharacterMemory(state, parsed);
  });
  spindle.sendToFrontend({
    type: "character_memory_updated",
    chatId,
    characterAppearance: committed.characterAppearance
  }, userId);
  logStage(config, "character_memory_persisted", { chatId, characterCount: Object.keys(committed.characterAppearance).length });
}

function logParsedSelection(
  parsed: ParsedPayload,
  selected: PromptEntry[],
  paragraphs: PreparedParagraph[],
  config: Config
): void {
  const scenes = parsed.scenes || [];
  const normalized = normalizeScenePayload(parsed, config as any);
  logStage(config, "parsed_payload_summary", {
    sceneCount: scenes.length,
    normalizedCount: normalized.length,
    parserParagraphs: normalized.map((entry) => entry.parserParagraph),
    rejectedParagraphs: normalized.map((entry) => entry.parserParagraph).filter((paragraph) => paragraph < 1 || paragraph > paragraphs.length),
    charactersPerShot: normalized.map((entry) => cleanArray<any>(entry.shot.characters).length)
  });
  logStage(config, "prompt_selection_done", {
    promptCount: normalized.length,
    selectedCount: selected.length,
    parserParagraphs: selected.map((entry) => entry.parserParagraph),
    originalParagraphs: selected.map((entry) => entry.paragraph),
    promptLengths: selected.map((entry) => entry.prompt.sections.join("").length),
    negativeLengths: selected.map((entry) => entry.negative.length),
    mode: config.mode
  });
}

async function prepareAndDispatchImages(
  chatId: string,
  selected: PromptEntry[],
  config: Config,
  userId?: string,
  preparedImageConnection?: Promise<ImageConnection | null>,
  lorebookSnapshot?: LorebookContextSnapshot
): Promise<PreparedImageStage> {
  // Original no-scene completion never touches the image provider. The parser
  // may return scenes that all drop during paragraph selection; that is a
  // successful zero-image completion, even when no image connection exists.
  if (selected.length === 0) return { jobs: [], results: [] };
  const imageConnection = await (preparedImageConnection || resolveImageConnection(config, userId));
  const preparationStartedAt = Date.now();
  logStage(config, "image_generation_preparation_start", {
    total: selected.length,
    provider: imageConnection?.provider || "(default)",
    connectionId: imageConnection?.id || null
  });
  const submissionStartedAt = Date.now();

  return prepareAndDispatchImageJobs(selected, async (entry, index) => {
    const jobStartedAt = Date.now();
    logStage(config, "image_generation_preparation_job_start", { index: index + 1, total: selected.length, paragraph: entry.paragraph });
    // Recompute final prompts from raw with current config + preset (ensures dynamic preset applied)
    const raw = entry.rawPromptData;
    let finalPrompt: string;
    let finalNegative: string;
    if (raw) {
      // Use current config + lorebook entries at generation time
      [finalPrompt, finalNegative] = getFinalPromptsForGeneration(raw, config);
    } else {
      // Legacy fallback: use stored assembled prompt directly
      finalPrompt = entry.prompt.sections.join("");
      finalNegative = entry.negative || "";
    }
    const prompt = finalPrompt;
    const negative = finalNegative;
    const corePrompt = raw ? raw.setup + (raw.charPos ? ", " + raw.charPos : "") : "";
    const promptFormat = entry.corePrompt.format || "ordered";
    const parameters = await buildImageParameters(config, imageConnection, prompt, negative || "");
    const job: PreparedImageJob = {
      index,
      total: selected.length,
      prompt,
      negative: negative || "",
      corePrompt,
      shotNegative: raw?.charNeg ?? entry.shotNegative,
      promptFormat,
      paragraph: entry.paragraph,
      parserParagraph: entry.parserParagraph,
      quote: entry.quote,
      parameters,
      rawPromptData: raw
    };
    logStage(config, "image_generation_prepared", {
      index: index + 1,
      total: selected.length,
      paragraph: entry.paragraph,
      elapsedMs: Date.now() - jobStartedAt,
      preparationElapsedMs: Date.now() - preparationStartedAt,
      promptLength: prompt.length,
      parameterKeys: keysOf(parameters)
    });
    if (index === selected.length - 1) {
      logStage(config, "image_generation_preparation_done", {
        total: selected.length,
        elapsedMs: Date.now() - preparationStartedAt,
        provider: imageConnection?.provider || "(default)"
      });
    }
    return job;
  }, (job) => {
    const submittedAt = Date.now();
    logStage(config, "image_generation_request_submitted", {
      index: job.index + 1,
      total: job.total,
      paragraph: job.paragraph,
      provider: imageConnection?.provider || "(default)",
      dispatch: "sequential",
      elapsedMs: submittedAt - submissionStartedAt
    });
    return spindle.imageGen.generate({
      connection_id: config.imageConnectionId || undefined,
      prompt: job.prompt,
      negativePrompt: job.negative || undefined,
      model: config.imageModel || undefined,
      parameters: job.parameters,
      owner_chat_id: chatId,
      userId
    }).then((result) => {
      logStage(config, "image_generation_completed", {
        index: job.index + 1,
        total: job.total,
        paragraph: job.paragraph,
        elapsedMs: Date.now() - submittedAt,
        imageId: result.imageId || null,
        provider: result.provider || imageConnection?.provider || null,
        model: result.model || null
      });
      return result;
    }, (error) => {
      logStage(config, "image_generation_failed", {
        index: job.index + 1,
        total: job.total,
        paragraph: job.paragraph,
        elapsedMs: Date.now() - submittedAt,
        error: error instanceof Error ? error.message : String(error)
      }, "error");
      throw error;
    });
  });
}

function collectImageResults(stage: PreparedImageStage, config: Config): ImageAssets {
  const imageIds: string[] = [];
  const imageUrls: string[] = [];
  const prompts = stage.jobs.map((job) => job.prompt);
  const negativePrompts = stage.jobs.map((job) => job.negative);
  const quotes = stage.jobs.map((job) => job.quote || "");
  const imageParameters = stage.jobs.map((job) => job.parameters);
  const corePrompts = stage.jobs.map((job) => job.corePrompt || "");
  const shotNegatives = stage.jobs.map((job) => job.shotNegative || "");
  const promptFormats = stage.jobs.map((job) => job.promptFormat || "ordered");
  const paragraphs = stage.jobs.map((job) => job.paragraph);
  const rawPromptData = stage.jobs.map((job) => job.rawPromptData!);
  for (const [index, result] of stage.results.entries()) {
    if (result.imageId) imageIds.push(result.imageId);
    const imageUrl = result.imageUrl || (result.imageId ? imageUrlFromId(result.imageId) : "");
    if (imageUrl) imageUrls.push(imageUrl);
    logStage(config, "image_generation_results_collected", {
      index: index + 1,
      imageId: result.imageId || null,
      returnedImageUrl: result.imageUrl || null,
      markdownImageUrl: imageUrls[imageUrls.length - 1] || null,
      provider: result.provider || null,
      model: result.model || null
    });
  }
  return {
    prompts,
    negativePrompts,
    quotes,
    imageParameters,
    corePrompts,
    shotNegatives,
    promptFormats,
    paragraphs,
    imageIds,
    imageUrls,
    rawPromptData
  };
}

async function persistGeneration(input: PersistStageInput): Promise<GeneratedRecord> {
  const { chatId, messageId, swipeId, key, target, parsed, assets, config, userId } = input;
  const record: GeneratedRecord = {
    chatId,
    messageId,
    swipeId,
    prompts: assets.prompts,
    negativePrompts: assets.negativePrompts,
    quotes: assets.quotes,
    imageParameters: assets.imageParameters,
    corePrompts: assets.corePrompts,
    shotNegatives: assets.shotNegatives,
    promptFormats: assets.promptFormats,
    paragraphs: assets.paragraphs,
    imageIds: assets.imageIds,
    imageUrls: assets.imageUrls,
    rawJson: parsed,
    createdAt: new Date().toISOString(),
    rawPromptData: assets.rawPromptData
  };
  const reference = await storeGeneratedRecord(chatId, key, record, userId);
  const committed = await updateState(chatId, userId, async (state) => {
    await migrateLegacyGeneratedRecords(chatId, state, userId);
    updateCharacterMemory(state, parsed);
    state.generated[key] = reference;
    delete state.previousVisualState;
    rebuildGeneratedImageIndex(state);
  });
  logStage(config, "state_persisted", { key, imageCount: assets.imageIds.length, paragraphs: assets.paragraphs });
  const originalContent = String(target.content || "");
  const nextContent = renderInlaidMessage(originalContent, record, config);
  logStage(config, "inlay_rendered", {
    originalLength: originalContent.length,
    finalLength: nextContent.length,
    originalParagraphs: paragraphCount(originalContent),
    imageCount: assets.imageUrls.length,
    paragraphs: assets.paragraphs
  });
  await spindle.chat.updateMessage(chatId, messageId, {
    content: nextContent,
    metadata: {
      ...(target.metadata || {}),
      inlayIllustratorImageIds: assets.imageIds,
      inlayIllustratorParagraphs: assets.paragraphs,
      inlayIllustratorGeneratedAt: record.createdAt
    }
  });
  logStage(config, "message_updated", { chatId, messageId, imageIds: assets.imageIds, paragraphs: assets.paragraphs });
  spindle.sendToFrontend({
    type: "character_memory_updated",
    chatId,
    characterAppearance: committed.characterAppearance
  }, userId);
  spindle.sendToFrontend({ type: "status", status: "Generated", record }, userId);
  return record;
}

type ImageReplacement = {
  prompt: string;
  negative: string;
  quote: string;
  corePrompt: string;
  shotNegative: string;
  promptFormat: "legacy" | "ordered";
  paragraph: number;
  parameters: Record<string, unknown>;
  imageId: string;
  imageUrl: string;
  rawPromptData?: RawPromptData;
};

async function commitImageReplacement(
  request: StoredImageActionRequest,
  replacement: ImageReplacement,
  config: Config,
  userId?: string,
  parsedForMemory?: ParsedPayload
): Promise<{ record: GeneratedRecord; index: number }> {
  let committedKey = "";
  let committedIndex = -1;
  let committedRecord: GeneratedRecord | null = null;
  const state = await updateState(request.chatId, userId, async (current) => {
    await migrateLegacyGeneratedRecords(request.chatId, current, userId);
    const located = await locateStoredGeneratedImage(current, request, userId);
    committedKey = located.key;
    committedIndex = located.index;
    const record = located.record;
    const nextPrompts = replaceAt(record.prompts, located.index, replacement.prompt, "");
    const nextNegativePrompts = replaceAt(record.negativePrompts, located.index, replacement.negative, "");
    const nextQuotes = replaceAt(record.quotes, located.index, replacement.quote, "");
    const nextImageParameters = replaceAt(record.imageParameters, located.index, replacement.parameters, {});
    const nextCorePrompts = replaceAt(record.corePrompts, located.index, replacement.corePrompt, "");
    const nextShotNegatives = replaceAt(record.shotNegatives, located.index, replacement.shotNegative, "");
    const nextPromptFormats = replaceAt(record.promptFormats, located.index, replacement.promptFormat, "ordered");
    const nextParagraphs = replaceAt(record.paragraphs, located.index, replacement.paragraph, 1);
    const nextImageIds = replaceAt(record.imageIds, located.index, replacement.imageId, "");
    const nextImageUrls = replaceAt(record.imageUrls, located.index, replacement.imageUrl, "");
    let nextRawPromptData: RawPromptData[] | undefined = record.rawPromptData;
    if (replacement.rawPromptData !== undefined) {
      nextRawPromptData = replaceAt(record.rawPromptData, located.index, replacement.rawPromptData, replacement.rawPromptData);
    } else if (record.rawPromptData !== undefined) {
      nextRawPromptData = record.rawPromptData;
    } else {
      nextRawPromptData = undefined;
    }
    committedRecord = {
      ...record,
      prompts: nextPrompts,
      negativePrompts: nextNegativePrompts,
      quotes: nextQuotes,
      imageParameters: nextImageParameters,
      corePrompts: nextCorePrompts,
      shotNegatives: nextShotNegatives,
      promptFormats: nextPromptFormats,
      paragraphs: nextParagraphs,
      imageIds: nextImageIds,
      imageUrls: nextImageUrls,
      ...(nextRawPromptData !== undefined ? { rawPromptData: nextRawPromptData } : {}),
    } satisfies GeneratedRecord;
    // Ensure rawPromptData absent when neither had data
    if (nextRawPromptData === undefined && (committedRecord as any).rawPromptData !== undefined) {
      delete (committedRecord as any).rawPromptData;
    }
    current.generated[located.key] = await storeGeneratedRecord(request.chatId, located.key, committedRecord, userId);
    if (parsedForMemory) updateCharacterMemory(current, parsedForMemory);
    rebuildGeneratedImageIndex(current);
  });
  const record = committedRecord as GeneratedRecord | null;
  if (!record || committedIndex < 0) throw new Error("The replacement image could not be persisted.");

  const messages = await spindle.chat.getMessages(request.chatId) as ChatMessage[];
  const target = messages.find((message) => message.id === record.messageId);
  if (!target) throw new Error("The source assistant message no longer exists.");
  await spindle.chat.updateMessage(request.chatId, record.messageId, {
    content: renderInlaidMessage(String(target.content || ""), record, config),
    metadata: {
      ...(target.metadata || {}),
      inlayIllustratorImageIds: record.imageIds,
      inlayIllustratorParagraphs: record.paragraphs,
      inlayIllustratorGeneratedAt: record.createdAt
    }
  });
  if (parsedForMemory) {
    spindle.sendToFrontend({
      type: "character_memory_updated",
      chatId: request.chatId,
      characterAppearance: state.characterAppearance
    }, userId);
  }
  return { record, index: committedIndex };
}

export async function rerunStoredImage(
  request: StoredImageActionRequest,
  rerunSidecar: boolean,
  userId?: string,
  preparedConfig?: Config
): Promise<{ record: GeneratedRecord; index: number }> {
  if (!request.chatId) throw new Error("Open the image's chat first.");
  const actionKey = JSON.stringify([userId ?? null, request.chatId, request.messageId ?? null, request.swipeId ?? null,
    request.imageIndex ?? null, request.imageId ?? request.imageUrl ?? null]);
  const releaseAction = tryAcquireRuntimeLock("image-action", actionKey);
  if (!releaseAction) throw new Error("That image is already being regenerated.");
  try {
    const config = preparedConfig || await getConfig(userId);
    const initialState = await getState(request.chatId, userId);
    const located = await locateStoredGeneratedImage(initialState, request, userId);
    const imageConnection = await resolveImageConnection(config, userId);
    let replacement: ImageReplacement;
    let selectionForMemory: ParsedPayload | undefined;

    if (!rerunSidecar) {
      // Recompute from stored rawPromptData using CURRENT settings (original getFinalPromptsForGeneration recomposes)
      const raw = located.record.rawPromptData?.[located.index];
      let prompt: string;
      let negative: string;
      let corePrompt: string;
      let shotNegative: string;
      let promptFormat: "legacy" | "ordered";
      let parameters: Record<string, unknown>;
      if (raw) {
        [prompt, negative] = getFinalPromptsForGeneration(raw, config);
        corePrompt = raw.setup + (raw.charPos ? ", " + raw.charPos : "");
        shotNegative = raw.charNeg;
        promptFormat = config.promptStyle === "default" ? "legacy" : "ordered";
        const originalParameters = located.record.imageParameters?.[located.index]
          || await buildImageParameters(config, imageConnection, prompt, negative);
        parameters = rerollImageParameters(originalParameters, imageConnection, prompt, negative);
        const result = await spindle.imageGen.generate({
          connection_id: config.imageConnectionId || undefined,
          prompt,
          negativePrompt: negative || undefined,
          model: config.imageModel || undefined,
          parameters,
          owner_chat_id: request.chatId,
          userId
        });
        const imageId = result.imageId || "";
        const imageUrl = result.imageUrl || (imageId ? imageUrlFromId(imageId) : "");
        if (!imageUrl) throw new Error("The image provider returned no replacement image.");
        replacement = {
          prompt,
          negative,
          quote: located.record.quotes?.[located.index] || "",
          corePrompt,
          shotNegative,
          promptFormat,
          paragraph: located.record.paragraphs[located.index] || 1,
          parameters,
          imageId,
          imageUrl,
          rawPromptData: raw
        };
      } else {
        // Legacy fallback: use stored frozen prompt (documented fallback)
        const legacyPrompt = located.record.prompts[located.index] || "";
        if (!legacyPrompt) throw new Error("The selected image has no stored prompt to reroll.");
        const legacyNegative = located.record.negativePrompts?.[located.index] || "";
        const legacyCore = located.record.corePrompts?.[located.index] || "";
        const legacyFormat = located.record.promptFormats?.[located.index]
          || (config.promptStyle === "default" ? "legacy" : "ordered");
        const legacyShotNeg = located.record.shotNegatives?.[located.index] || "";
        const originalParameters = located.record.imageParameters?.[located.index]
          || await buildImageParameters(config, imageConnection, legacyPrompt, legacyNegative);
        const params = rerollImageParameters(originalParameters, imageConnection, legacyPrompt, legacyNegative);
        const result = await spindle.imageGen.generate({
          connection_id: config.imageConnectionId || undefined,
          prompt: legacyPrompt,
          negativePrompt: legacyNegative || undefined,
          model: config.imageModel || undefined,
          parameters: params,
          owner_chat_id: request.chatId,
          userId
        });
        const imageId = result.imageId || "";
        const imageUrl = result.imageUrl || (imageId ? imageUrlFromId(imageId) : "");
        if (!imageUrl) throw new Error("The image provider returned no replacement image.");
        replacement = {
          prompt: legacyPrompt,
          negative: legacyNegative,
          quote: located.record.quotes?.[located.index] || "",
          corePrompt: legacyCore,
          shotNegative: legacyShotNeg,
          promptFormat: legacyFormat,
          paragraph: located.record.paragraphs[located.index] || 1,
          parameters: params,
          imageId,
          imageUrl
        };
      }
    } else {
      const messages = await spindle.chat.getMessages(request.chatId) as ChatMessage[];
      const target = messages.find((message) => message.id === located.record.messageId);
      if (!target) throw new Error("The source assistant message no longer exists.");
      const originalParagraph = located.record.paragraphs[located.index] || 1;
      const sourceParagraph = prepareParagraphs(String(target.content || ""), config)
        .find((paragraph) => paragraph.originalIndex === originalParagraph);
      if (!sourceParagraph) throw new Error("The source paragraph for this image no longer exists.");
      const singleConfig: Config = {
        ...config,
        minImages: 1,
        maxImages: 1,
        preprocessingEnabled: false
      };
      const paragraphs: PreparedParagraph[] = [{ ...sourceParagraph, parserIndex: 1 }];
      const selection = await parseAndSelectPrompts({
        chatId: request.chatId,
        messageId: located.record.messageId,
        messages,
        paragraphs,
        state: initialState,
        config: singleConfig,
        userId
      });
      selectionForMemory = selection.parsed;
      const entry = selection.selected[0];
      if (!entry) throw new Error("The sidecar returned no usable replacement prompt.");
      const stage = await prepareAndDispatchImages(
        request.chatId,
        [entry],
        singleConfig,
        userId,
        Promise.resolve(imageConnection),
        selection.snapshot
      );
      const job = stage.jobs[0];
      const result = stage.results[0];
      if (!job || !result) throw new Error("The replacement image was not generated.");
      const imageId = result.imageId || "";
      const imageUrl = result.imageUrl || (imageId ? imageUrlFromId(imageId) : "");
      if (!imageUrl) throw new Error("The image provider returned no replacement image.");
      replacement = {
        prompt: job.prompt,
        negative: job.negative,
        quote: entry.quote,
        corePrompt: job.corePrompt || "",
        shotNegative: job.shotNegative || entry.shotNegative,
        promptFormat: job.promptFormat || entry.corePrompt.format || "ordered",
        paragraph: originalParagraph,
        parameters: job.parameters,
        imageId,
        imageUrl,
        rawPromptData: entry.rawPromptData
      };
    }

    const committed = await commitImageReplacement(
      request,
      replacement,
      config,
      userId,
      rerunSidecar ? selectionForMemory : undefined
    );
    logStage(config, rerunSidecar ? "image_sidecar_rerun_done" : "image_reroll_done", {
      chatId: request.chatId,
      messageId: committed.record.messageId,
      imageIndex: committed.index,
      imageId: replacement.imageId || null
    });
    return committed;
  } finally {
    releaseAction();
  }
}

/**
 * Multi-candidate picker (original `processNaiReroll` with `Image.Reroll>1`).
 * Generates N images sequentially for the same recomputed prompt and returns candidates
 * without applying.
 */
export type RerollCandidate = { imageId: string; imageUrl: string; parameters: Record<string, unknown> };

export async function generateRerollCandidates(
  request: StoredImageActionRequest,
  count: number,
  userId?: string,
  preparedConfig?: Config
): Promise<{ record: GeneratedRecord; index: number; candidates: RerollCandidate[] }> {
  if (!request.chatId) throw new Error("Open the image's chat first.");
  const safeCount = Math.max(1, Math.min(8, Math.floor(count) || 1));
  const lockKey = JSON.stringify([userId ?? null, request.chatId, request.messageId ?? null, request.swipeId ?? null, request.imageIndex ?? null, request.imageId ?? request.imageUrl ?? null, "candidates", safeCount]);
  const releaseLock = tryAcquireRuntimeLock("image-action", lockKey);
  if (!releaseLock) throw new Error("That image is already being regenerated.");
  try {
    const config = preparedConfig || await getConfig(userId);
    const state = await getState(request.chatId, userId);
    const located = await locateStoredGeneratedImage(state, request, userId);
    const imageConnection = await resolveImageConnection(config, userId);
    // Recompute prompt from raw with current settings
    let prompt: string;
    let negative: string;
    const raw = located.record.rawPromptData?.[located.index];
    if (raw) {
      [prompt, negative] = getFinalPromptsForGeneration(raw, config);
    } else {
      prompt = located.record.prompts[located.index] || "";
      negative = located.record.negativePrompts?.[located.index] || "";
    }
    if (!prompt) throw new Error("The selected image has no stored prompt to reroll.");
    const baseParameters = located.record.imageParameters?.[located.index]
      || await buildImageParameters(config, imageConnection, prompt, negative);
    const candidates: RerollCandidate[] = [];
    let lastParams = baseParameters;
    for (let i = 0; i < safeCount; i += 1) {
      const params = rerollImageParameters(lastParams, imageConnection, prompt, negative);
      lastParams = params;
      try {
        const result = await spindle.imageGen.generate({
          connection_id: config.imageConnectionId || undefined,
          prompt,
          negativePrompt: negative || undefined,
          model: config.imageModel || undefined,
          parameters: params,
          owner_chat_id: request.chatId,
          userId
        });
        const imageId = result.imageId || "";
        const imageUrl = result.imageUrl || (imageId ? imageUrlFromId(imageId) : "");
        if (!imageUrl) {
          logStage(config, "reroll_candidate_failed", { index: i, reason: "empty_result" }, "warn");
          continue;
        }
        candidates.push({ imageId, imageUrl, parameters: params });
      } catch (error) {
        logStage(config, "reroll_candidate_failed", { index: i, error: error instanceof Error ? error.message : String(error) }, "warn");
        continue;
      }
    }
    if (candidates.length === 0) throw new Error("The image provider returned no candidates.");
    return { record: located.record, index: located.index, candidates };
  } finally {
    releaseLock();
  }
}

export async function applyRerollCandidate(
  request: StoredImageActionRequest,
  candidate: RerollCandidate,
  userId?: string,
  preparedConfig?: Config
): Promise<{ record: GeneratedRecord; index: number }> {
  if (!request.chatId) throw new Error("Open the image's chat first.");
  if (!candidate || typeof candidate !== "object") throw new Error("Missing candidate image.");
  const candidateImageUrl = typeof (candidate as Record<string, unknown>).imageUrl === "string" ? String((candidate as Record<string, unknown>).imageUrl).trim() : "";
  if (!candidateImageUrl) throw new Error("Missing candidate image.");
  const candidateParams = (candidate as Record<string, unknown>).parameters;
  if (!candidateParams || typeof candidateParams !== "object" || Array.isArray(candidateParams)) throw new Error("Invalid candidate parameters.");
  const candidateImageId = typeof (candidate as Record<string, unknown>).imageId === "string" ? String((candidate as Record<string, unknown>).imageId) : "";
  const lockKey = JSON.stringify([userId ?? null, request.chatId, request.messageId ?? null, request.swipeId ?? null, request.imageIndex ?? null, request.imageId ?? request.imageUrl ?? null, "apply", candidateImageUrl]);
  const releaseLock = tryAcquireRuntimeLock("image-action", lockKey);
  if (!releaseLock) throw new Error("That image is already being regenerated.");
  try {
    const config = preparedConfig || await getConfig(userId);
    const state = await getState(request.chatId, userId);
    const located = await locateStoredGeneratedImage(state, request, userId);
    const raw = located.record.rawPromptData?.[located.index];
    let prompt: string;
    let negative: string;
    if (raw) {
      [prompt, negative] = getFinalPromptsForGeneration(raw, config);
    } else {
      prompt = located.record.prompts[located.index] || "";
      negative = located.record.negativePrompts?.[located.index] || "";
    }
    const corePrompt = located.record.corePrompts?.[located.index] || "";
    const promptFormat = located.record.promptFormats?.[located.index] || (config.promptStyle === "default" ? "legacy" : "ordered");
    const shotNegative = located.record.shotNegatives?.[located.index] || "";
    const replacement: ImageReplacement = {
      prompt,
      negative,
      quote: located.record.quotes?.[located.index] || "",
      corePrompt,
      shotNegative,
      promptFormat,
      paragraph: located.record.paragraphs[located.index] || 1,
      parameters: candidateParams as Record<string, unknown>,
      imageId: candidateImageId,
      imageUrl: candidateImageUrl,
      rawPromptData: raw
    };
    return await commitImageReplacement(request, replacement, config, userId);
  } finally {
    releaseLock();
  }
}

/**
 * Full-batch reroll (original `processNaiFullReroll`).
 * Re-generates every image in the stored record sequentially, recomputing each from raw with current settings.
 */
export async function rerunAllStoredImages(
  chatId: string,
  messageId: string,
  swipeId: number | undefined,
  userId?: string,
  preparedConfig?: Config
): Promise<{ record: GeneratedRecord; failedCount: number }> {
  if (!chatId || !messageId) throw new Error("Open the image's chat first.");
  const lockKey = JSON.stringify([userId ?? null, chatId, messageId, swipeId ?? null, "full-reroll"]);
  const releaseLock = tryAcquireRuntimeLock("image-action", lockKey);
  if (!releaseLock) throw new Error("Full reroll is already running for that message.");
  try {
    const config = preparedConfig || await getConfig(userId);
    const key = `${chatId}:${messageId}:${swipeId ?? 0}`;
    const state = await getState(chatId, userId);
    const raw = state.generated[key];
    const record = await (async () => {
      const loaded = await loadGeneratedRecord(raw, userId, true);
      return loaded;
    })();
    if (!record) throw new Error("No generated record found for that message.");
    const imageConnection = await resolveImageConnection(config, userId);

    const imageIds = [...record.imageIds];
    const imageUrls = [...record.imageUrls];
    const imageParameters = [...(record.imageParameters || [])];
    const prompts = [...record.prompts];
    const negativePrompts = [...(record.negativePrompts || [])];
    let failedCount = 0;
    for (let i = 0; i < record.prompts.length; i += 1) {
      const rawData = record.rawPromptData?.[i];
      let prompt: string;
      let negative: string;
      if (rawData) {
        [prompt, negative] = getFinalPromptsForGeneration(rawData, config);
      } else {
        // Legacy fallback: frozen strings
        prompt = record.prompts[i] || "";
        negative = record.negativePrompts?.[i] || "";
      }
      if (!prompt) { failedCount += 1; continue; }
      const baseParams = record.imageParameters?.[i] || await buildImageParameters(config, imageConnection, prompt, negative);
      const params = rerollImageParameters(baseParams, imageConnection, prompt, negative);
      try {
        const result = await spindle.imageGen.generate({
          connection_id: config.imageConnectionId || undefined,
          prompt,
          negativePrompt: negative || undefined,
          model: config.imageModel || undefined,
          parameters: params,
          owner_chat_id: chatId,
          userId
        });
        const imageId = result.imageId || "";
        const imageUrl = result.imageUrl || (imageId ? imageUrlFromId(imageId) : "");
        if (!imageUrl) throw new Error("No imageUrl");
        imageIds[i] = imageId;
        imageUrls[i] = imageUrl;
        imageParameters[i] = params;
        prompts[i] = prompt;
        negativePrompts[i] = negative;
      } catch {
        failedCount += 1;
      }
    }
    const nextRecord: GeneratedRecord = { ...record, imageIds, imageUrls, imageParameters, prompts, negativePrompts };
    const reference = await storeGeneratedRecord(chatId, key, nextRecord, userId);
    await updateState(chatId, userId, async (current) => {
      await migrateLegacyGeneratedRecords(chatId, current, userId);
      current.generated[key] = reference;
      rebuildGeneratedImageIndex(current);
    });
    const messages = await spindle.chat.getMessages(chatId) as ChatMessage[];
    const target = messages.find((m) => m.id === messageId);
    if (target) {
      await spindle.chat.updateMessage(chatId, messageId, {
        content: renderInlaidMessage(String(target.content || ""), nextRecord, config),
        metadata: { ...(target.metadata || {}), inlayIllustratorImageIds: imageIds, inlayIllustratorParagraphs: record.paragraphs, inlayIllustratorGeneratedAt: nextRecord.createdAt }
      });
    }
    return { record: nextRecord, failedCount };
  } finally {
    releaseLock();
  }
}

export async function generateForMessage(
  chatId: string,
  messageId: string,
  content: string,
  userId?: string,
  prepared?: { config?: Config; messages?: ChatMessage[] }
): Promise<void> {
  const generationStartedAt = Date.now();
  const config = prepared?.config || await getConfig(userId);
  logStage(config, "request_received", { chatId, messageId, contentLength: content.length, enabled: config.enabled, autoGenerate: config.autoGenerate });
  if (!config.enabled) {
    logStage(config, "request_skipped", { reason: "disabled", chatId, messageId });
    return;
  }
  const messages = prepared?.messages || await spindle.chat.getMessages(chatId) as ChatMessage[];
  const target = messages.find((message) => message.id === messageId);
  logStage(config, "target_checked", {
    found: Boolean(target),
    role: target?.role || null,
    ownMessage: target ? isOwnMessage(target) : false,
    messageCount: messages.length
  });
  if (!target || target.role !== "assistant" || isOwnMessage(target)) return;
  const swipeId = Number.isFinite(Number(target.swipe_id)) ? Number(target.swipe_id) : 0;
  const key = `${chatId}:${messageId}:${swipeId}`;
  const runningKey = JSON.stringify([userId ?? null, key]);
  const releaseGeneration = tryAcquireRuntimeLock("generation", runningKey);
  if (!releaseGeneration) {
    logStage(config, "request_skipped", { reason: "already_running", key });
    return;
  }
  try {
    const state = await getState(chatId, userId);
    if (state.generated[key]) {
      logStage(config, "request_skipped", { reason: "already_generated", key });
      return;
    }
    const sourceContent = String(content || target.content || "");
    const paragraphs = prepareParagraphs(sourceContent, config);
    logStage(config, "paragraph_cleanup_done", {
      originalParagraphs: paragraphCount(sourceContent),
      parserParagraphs: paragraphs.length,
      mappedOriginalParagraphs: paragraphs.map((paragraph) => paragraph.originalIndex),
      ignoredTagCount: ignoredTagNames(config).length
    });
    if (paragraphs.length === 0) throw new Error("No usable paragraphs found for image parsing.");

    const imageConnectionPromise = resolveImageConnection(config, userId);
    void imageConnectionPromise.catch(() => undefined);
    const { parsed, selected, snapshot } = await parseAndSelectPrompts({ chatId, messageId, messages, paragraphs, state, config, userId });
    logParsedSelection(parsed, selected, paragraphs, config);
    if (selected.length === 0) {
      // Original no-image completion: persist memory, no retry, no image generation
      await persistCharacterMemory(chatId, parsed, config, userId);
      logStage(config, "generation_pipeline_done", {
        chatId,
        messageId,
        imageCount: 0,
        elapsedMs: Date.now() - generationStartedAt,
        reason: "no_selected_shots"
      });
      return;
    }
    try {
      const imageStage = await prepareAndDispatchImages(chatId, selected, config, userId, imageConnectionPromise, snapshot);
      const assets = collectImageResults(imageStage, config);
      await persistGeneration({ chatId, messageId, swipeId, key, target, parsed, assets, config, userId });
      logStage(config, "generation_pipeline_done", {
        chatId,
        messageId,
        imageCount: assets.imageIds.length,
        elapsedMs: Date.now() - generationStartedAt
      });
    } catch (error) {
      await persistCharacterMemory(chatId, parsed, config, userId);
      throw error;
    }
  } finally {
    releaseGeneration();
  }
}
