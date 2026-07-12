import type { Config } from "../shared/config.js";
import { cleanupPrompt } from "./cleanup.js";
import { buildParserContext, isOwnMessage } from "./context.js";
import { buildImageParameters, prepareAndDispatchImageJobs, resolveImageConnection } from "./images.js";
import { logStage } from "./logging.js";
import { updateCache } from "./memory.js";
import { ignoredTagNames, paragraphCount, prepareParagraphs } from "./paragraphs.js";
import {
  continuityReference,
  parsePayloadWithRepair,
  parserInstruction,
  parserMessages,
  parserUserRequest,
  preprocessTargetParagraphs,
  resolveParserConnection
} from "./parser.js";
import { renderPrompt } from "./prompt.js";
import { imageUrlFromId, renderInlaidMessage } from "./rendering.js";
import { normalizeScenePayload, selectPromptEntries } from "./scenes.js";
import { getConfig, getState, writeJson } from "./storage.js";
import type {
  CharacterJson,
  ChatMessage,
  GeneratedRecord,
  ParsedPayload,
  PreparedImageJob,
  PreparedParagraph,
  PromptEntry,
  State
} from "./types.js";
import { cleanArray, keysOf } from "./utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

type ImageGenerationResult = Awaited<ReturnType<typeof spindle.imageGen.generate>>;
type ParsedSelection = { parsed: ParsedPayload; selected: PromptEntry[] };
type PreparedImageStage = { jobs: PreparedImageJob[]; results: ImageGenerationResult[] };
type ImageAssets = { prompts: string[]; paragraphs: number[]; imageIds: string[]; imageUrls: string[] };

type ParseStageInput = {
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
  state: State;
  parsed: ParsedPayload;
  assets: ImageAssets;
  config: Config;
  userId?: string;
};

const running = new Set<string>();

async function parseAndSelectPrompts(input: ParseStageInput): Promise<ParsedSelection> {
  const { chatId, messageId, messages, paragraphs, state, config, userId } = input;
  const parserConnection = await resolveParserConnection(config, userId);
  const targetIndex = Math.max(0, messages.findIndex((message) => message.id === messageId));
  let parsed: ParsedPayload | null = null;
  let selected: PromptEntry[] = [];
  let lastParserError: unknown = null;

  for (let attempt = 0; attempt <= config.parserRetries; attempt += 1) {
    try {
      const context = await buildParserContext(chatId, messages, targetIndex, state.characterAppearance, config, attempt, userId);
      const targetSource = await preprocessTargetParagraphs(parserConnection, config, paragraphs, context, userId);
      const instruction = parserInstruction(config);
      const referenceContext = continuityReference(context.systemContext, context.recentContext);
      const userRequest = parserUserRequest(targetSource);
      logStage(config, "parser_prompt_built", {
        attempt,
        instructionLength: instruction.length,
        systemContextLength: context.systemContext.length,
        recentContextLength: context.recentContext.length,
        overrideLength: context.override.length,
        parserParagraphs: paragraphs.length,
        cacheCharacters: Object.keys(state.characterAppearance).length,
        promptStyle: config.promptStyle,
        promptSyntax: config.promptSyntax,
        mode: config.mode,
        maxCharacters: config.mode === "asset" ? 1 : config.maxCharacters,
        preprocessingEnabled: config.preprocessingEnabled,
        contextDiagnostics: context.diagnostics
      });
      parsed = await parsePayloadWithRepair(
        parserConnection,
        config,
        parserMessages(instruction, referenceContext, userRequest, context.override),
        userId
      );
      selected = selectPromptEntries(parsed, paragraphs, config);
      if (selected.length === 0) throw new Error("No usable prompts were parsed.");
      break;
    } catch (error) {
      lastParserError = error;
      logStage(
        config,
        "parser_attempt_failed",
        { attempt, retries: config.parserRetries, error: error instanceof Error ? error.message : String(error) },
        attempt >= config.parserRetries ? "error" : "warn"
      );
      if (attempt >= config.parserRetries) throw error;
    }
  }
  if (!parsed) throw new Error(lastParserError instanceof Error ? lastParserError.message : "Parser did not return usable prompts.");
  return { parsed, selected };
}

async function persistCharacterMemory(
  chatId: string,
  state: State,
  parsed: ParsedPayload,
  config: Config,
  userId?: string
): Promise<void> {
  updateCache(state.characterAppearance, parsed);
  await writeJson(`states/${chatId}.json`, state, userId);
  spindle.sendToFrontend({
    type: "character_memory_updated",
    chatId,
    characterAppearance: state.characterAppearance
  }, userId);
  logStage(config, "character_memory_persisted", { chatId, characterCount: Object.keys(state.characterAppearance).length });
}

function logParsedSelection(
  parsed: ParsedPayload,
  selected: PromptEntry[],
  paragraphs: PreparedParagraph[],
  config: Config
): void {
  const scenes = parsed.scenes || [];
  const normalized = normalizeScenePayload(parsed);
  logStage(config, "parsed_payload_summary", {
    sceneCount: scenes.length,
    normalizedCount: normalized.length,
    parserParagraphs: normalized.map((entry) => entry.parserParagraph),
    rejectedParagraphs: normalized.map((entry) => entry.parserParagraph).filter((paragraph) => paragraph < 1 || paragraph > paragraphs.length),
    charactersPerShot: normalized.map((entry) => cleanArray<CharacterJson>(entry.shot.characters).length)
  });
  logStage(config, "prompt_selection_done", {
    promptCount: normalized.length,
    selectedCount: selected.length,
    parserParagraphs: selected.map((entry) => entry.parserParagraph),
    originalParagraphs: selected.map((entry) => entry.paragraph),
    promptLengths: selected.map((entry) => renderPrompt(entry.prompt, config.promptSyntax).length),
    negativeLengths: selected.map((entry) => entry.negative.length)
  });
}

async function prepareAndDispatchImages(
  chatId: string,
  selected: PromptEntry[],
  config: Config,
  userId?: string
): Promise<PreparedImageStage> {
  const imageConnection = await resolveImageConnection(config, userId);
  const preparationStartedAt = Date.now();
  logStage(config, "image_generation_preparation_start", {
    total: selected.length,
    provider: imageConnection?.provider || "(default)",
    connectionId: imageConnection?.id || null
  });
  const eagerComfyQueueing = imageConnection?.provider === "comfyui";
  const submissionStartedAt = Date.now();
  return prepareAndDispatchImageJobs(selected, eagerComfyQueueing, async (entry, index) => {
    const jobStartedAt = Date.now();
    logStage(config, "image_generation_preparation_job_start", { index: index + 1, total: selected.length, paragraph: entry.paragraph });
    const prompt = await cleanupPrompt(entry.prompt, config);
    const parameters = await buildImageParameters(config, imageConnection, prompt, entry.negative || "");
    const job: PreparedImageJob = {
      index,
      total: selected.length,
      prompt,
      negative: entry.negative || "",
      paragraph: entry.paragraph,
      parameters
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
      dispatch: eagerComfyQueueing ? "eager_comfyui" : "sequential",
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
  const paragraphs = stage.jobs.map((job) => job.paragraph);
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
  return { prompts, paragraphs, imageIds, imageUrls };
}

async function persistGeneration(input: PersistStageInput): Promise<GeneratedRecord> {
  const { chatId, messageId, swipeId, key, target, state, parsed, assets, config, userId } = input;
  const record: GeneratedRecord = {
    chatId,
    messageId,
    swipeId,
    prompts: assets.prompts,
    paragraphs: assets.paragraphs,
    imageIds: assets.imageIds,
    imageUrls: assets.imageUrls,
    rawJson: parsed,
    createdAt: new Date().toISOString()
  };
  state.generated[key] = record;
  await writeJson(`states/${chatId}.json`, state, userId);
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
  spindle.sendToFrontend({ type: "status", status: "Generated", record }, userId);
  return record;
}

export async function generateForMessage(chatId: string, messageId: string, content: string, userId?: string): Promise<void> {
  const config = await getConfig(userId);
  logStage(config, "request_received", { chatId, messageId, contentLength: content.length, enabled: config.enabled, autoGenerate: config.autoGenerate });
  if (!config.enabled) {
    logStage(config, "request_skipped", { reason: "disabled", chatId, messageId });
    return;
  }
  const messages = await spindle.chat.getMessages(chatId) as ChatMessage[];
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
  if (running.has(key)) {
    logStage(config, "request_skipped", { reason: "already_running", key });
    return;
  }
  running.add(key);
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

    const { parsed, selected } = await parseAndSelectPrompts({ chatId, messageId, messages, paragraphs, state, config, userId });
    await persistCharacterMemory(chatId, state, parsed, config, userId);
    logParsedSelection(parsed, selected, paragraphs, config);
    const imageStage = await prepareAndDispatchImages(chatId, selected, config, userId);
    const assets = collectImageResults(imageStage, config);
    await persistGeneration({ chatId, messageId, swipeId, key, target, state, parsed, assets, config, userId });
  } finally {
    running.delete(key);
  }
}
