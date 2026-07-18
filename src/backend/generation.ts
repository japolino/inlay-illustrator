import type { Config, PerspectiveMode } from "../shared/config.js";
import {
  buildLorebookContextSnapshot,
  buildParserContext,
  isOwnMessage,
  loadParserContextSources,
  type LorebookContextSnapshot
} from "./context.js";
import {
  chooseCreativeConcepts,
  creativeConceptConstraint,
  hasUnusedCreativeConcepts,
  rebaseCreativeConcepts
} from "./creative.js";
import { buildImageParameters, prepareAndDispatchImageJobs, rerollImageParameters, resolveImageConnection } from "./images.js";
import { logStage } from "./logging.js";
import { updateCache } from "./memory.js";
import { ignoredTagNames, paragraphCount, prepareParagraphs } from "./paragraphs.js";
import {
  continuityReference,
  formatTargetParagraphs,
  generateCreativeConcepts,
  parsePayloadWithRepair,
  parserInstruction,
  parserMessages,
  parserUserRequest,
  preprocessTargetParagraphs,
  repairDynamicCameraDiversity,
  resolveParserConnection
} from "./parser.js";
import { renderNegativeWithCurrentSelection, renderPrompt, renderPromptWithCurrentAffixes } from "./prompt.js";
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
  CharacterJson,
  ChatMessage,
  CreativeConcept,
  GeneratedRecord,
  ImageConnection,
  ParsedPayload,
  PreparedImageJob,
  PreparedParagraph,
  PromptEntry,
  PreviousVisualState,
  State
} from "./types.js";
import { cleanArray, cleanString, keysOf } from "./utils.js";
import { applyPreviousVisualState, buildPreviousVisualState } from "./visual-state.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

type ImageGenerationResult = Awaited<ReturnType<typeof spindle.imageGen.generate>>;
type ParsedSelection = { parsed: ParsedPayload; selected: PromptEntry[] };
type PreparedImageStage = { jobs: PreparedImageJob[]; results: ImageGenerationResult[] };
type ImageAssets = {
  prompts: string[];
  negativePrompts: string[];
  perspectiveModes: PerspectiveMode[];
  perspectiveSources: Array<"adaptive" | "manual">;
  imageParameters: Array<Record<string, unknown>>;
  corePrompts: string[];
  shotNegatives: string[];
  promptFormats: Array<"legacy" | "ordered">;
  creativeConcepts: Array<CreativeConcept | null>;
  creativeConceptCandidates: CreativeConcept[][];
  creativeConceptHistory: string[][];
  paragraphs: number[];
  imageIds: string[];
  imageUrls: string[];
};

export type ParseStageInput = {
  chatId: string;
  messageId: string;
  messages: ChatMessage[];
  paragraphs: PreparedParagraph[];
  state: State;
  config: Config;
  creativeCandidates?: CreativeConcept[];
  usedCreativeConceptIds?: string[];
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
  visualState: PreviousVisualState | null;
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
  perspectiveMode: PerspectiveMode | null;
  perspectiveSource: "adaptive" | "manual" | null;
  creativeConcept: string;
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
  const concept = located.record.creativeConcepts?.[located.index];
  return {
    prompt: located.record.prompts[located.index] || "",
    negativePrompt: located.record.negativePrompts?.[located.index] || "",
    perspectiveMode: located.record.perspectiveModes?.[located.index] || null,
    perspectiveSource: located.record.perspectiveSources?.[located.index] || null,
    creativeConcept: concept ? `${concept.anchor}: ${concept.concept}` : ""
  };
}

function replaceAt<T>(values: T[] | undefined, index: number, value: T, fallback: T): T[] {
  const next = [...(values || [])];
  while (next.length <= index) next.push(fallback);
  next[index] = value;
  return next;
}

export function compactLorebookNeedsFullRetry(payload: ParsedPayload, snapshot: LorebookContextSnapshot): boolean {
  if (!snapshot.compacted || !snapshot.hasCharacterVisualReference) return false;
  const characters = normalizeScenePayload(payload).flatMap(({ shot }) => cleanArray<CharacterJson>(shot.characters));
  if (characters.length === 0) return false;
  return !characters.some((character) => [character.identity, character.appearance, character.body, character.attire]
    .some((value) => cleanString(value)));
}

function retryClassification(error: unknown): "transient" | "context" | "terminal" {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b(?:401|403|404)\b|unauthori[sz]ed|forbidden|connection not found|select a parser connection/i.test(message)) {
    return "terminal";
  }
  if (/\b(?:408|409|425|429|500|502|503|504|520|522|523|524|525)\b|timeout|timed out|handshake|temporar|rate limit/i.test(message)) {
    return "transient";
  }
  if (/\b400\b.*(?:invalid argument|bad request)/i.test(message)) return "terminal";
  return "context";
}

async function waitForParserRetry(attempt: number): Promise<void> {
  const delay = Math.min(1500, 250 * (2 ** attempt)) + Math.floor(Math.random() * 125);
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

export async function parseAndSelectPrompts(input: ParseStageInput): Promise<ParsedSelection> {
  const { chatId, messageId, messages, paragraphs, state, config, userId } = input;
  const targetIndex = Math.max(0, messages.findIndex((message) => message.id === messageId));
  let parsed: ParsedPayload | null = null;
  let selected: PromptEntry[] = [];
  let lastParserError: unknown = null;
  let conceptCandidates = [...(input.creativeCandidates || [])];
  let conceptSelections: Map<number, CreativeConcept> | null = null;
  let ideationAttempted = false;
  let creativeTargetSource: string | null = null;
  const usedConceptIds = new Set(input.usedCreativeConceptIds || []);
  const manualCreative = !config.adaptiveMode && config.perspectiveMode === "creative";
  const creativePipeline = manualCreative || config.adaptiveMode;
  const [parserConnection, lorebookSnapshot, contextSources] = await Promise.all([
    resolveParserConnection(config, userId),
    buildLorebookContextSnapshot(
      chatId,
      paragraphs.map((paragraph) => paragraph.text).join("\n\n"),
      config,
      userId
    ),
    loadParserContextSources(chatId, config, userId)
  ]);

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
        lorebookSnapshot,
        config.previousVisualStateEnabled ? state.previousVisualState : undefined,
        contextSources
      );
      if (manualCreative && conceptSelections === null) {
        if (!hasUnusedCreativeConcepts(conceptCandidates, usedConceptIds) && !ideationAttempted) {
          const previousConcepts = conceptCandidates
            .filter((concept) => usedConceptIds.has(concept.id))
            .map((concept) => concept.concept);
          conceptCandidates = await generateCreativeConcepts(
            parserConnection,
            config,
            paragraphs,
            formatTargetParagraphs(paragraphs),
            context,
            previousConcepts,
            userId
          );
          ideationAttempted = true;
        }
        conceptSelections = chooseCreativeConcepts(conceptCandidates, usedConceptIds);
        if (conceptSelections.size === 0 && conceptCandidates.length > 0) {
          conceptSelections = chooseCreativeConcepts(conceptCandidates);
        }
      }
      if (creativePipeline && creativeTargetSource === null) {
        const candidateParagraphs = new Set(conceptCandidates.map((concept) => concept.paragraph));
        if (manualCreative && config.preprocessingEnabled && candidateParagraphs.size > 0) {
          creativeTargetSource = formatTargetParagraphs(
            paragraphs.filter((paragraph) => candidateParagraphs.has(paragraph.parserIndex))
          );
          logStage(config, "creative_preprocessing_done", {
            candidateCount: conceptCandidates.length,
            selectedParagraphs: [...candidateParagraphs].sort((left, right) => left - right)
          });
        } else {
          creativeTargetSource = await preprocessTargetParagraphs(parserConnection, config, paragraphs, context, userId);
        }
      }
      const targetSource = creativePipeline
        ? creativeTargetSource || formatTargetParagraphs(paragraphs)
        : await preprocessTargetParagraphs(parserConnection, config, paragraphs, context, userId);
      const instruction = parserInstruction(config);
      const referenceContext = continuityReference(context.systemContext, context.recentContext);
      const userRequest = parserUserRequest(
        targetSource,
        manualCreative ? creativeConceptConstraint(conceptSelections || new Map(), false) : ""
      );
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
        adaptiveMode: config.adaptiveMode,
        perspectiveMode: config.perspectiveMode,
        maxCharacters: config.maxCharacters,
        preprocessingEnabled: config.preprocessingEnabled,
        contextDiagnostics: context.diagnostics
      });
      parsed = await parsePayloadWithRepair(
        parserConnection,
        config,
        parserMessages(instruction, referenceContext, userRequest, context.override),
        userId
      );
      parsed = applyPreviousVisualState(
        parsed,
        config.previousVisualStateEnabled ? state.previousVisualState : undefined
      );
      parsed = await repairDynamicCameraDiversity(parserConnection, config, parsed, targetSource, userId);
      if (config.adaptiveMode) {
        const creativeParagraphs = new Set(normalizeScenePayload(parsed)
          .filter(({ shot }) => cleanString(shot.perspectiveMode).toLowerCase() === "creative")
          .map(({ parserParagraph }) => parserParagraph));
        if (creativeParagraphs.size > 0) {
          const creativeParagraphEntries = paragraphs.filter((paragraph) => creativeParagraphs.has(paragraph.parserIndex));
          if (!hasUnusedCreativeConcepts(conceptCandidates, usedConceptIds) && !ideationAttempted) {
            const previousConcepts = conceptCandidates
              .filter((concept) => usedConceptIds.has(concept.id))
              .map((concept) => concept.concept);
            conceptCandidates = await generateCreativeConcepts(
              parserConnection,
              config,
              creativeParagraphEntries,
              formatTargetParagraphs(creativeParagraphEntries),
              context,
              previousConcepts,
              userId
            );
            ideationAttempted = true;
          }
          conceptSelections = chooseCreativeConcepts(
            conceptCandidates.filter((concept) => creativeParagraphs.has(concept.paragraph)),
            usedConceptIds
          );
          if (conceptSelections.size === 0 && conceptCandidates.length > 0) {
            conceptSelections = chooseCreativeConcepts(
              conceptCandidates.filter((concept) => creativeParagraphs.has(concept.paragraph))
            );
          }
        } else {
          conceptSelections = new Map();
        }
      }
      selected = selectPromptEntries(parsed, paragraphs, config, conceptSelections || new Map(), conceptCandidates);
      if (!config.adaptiveMode && config.perspectiveMode === "creative" && (conceptSelections?.size || 0) > 0) {
        selected = selected.filter((entry) => Boolean(entry.creativeConcept));
      }
      if (selected.length === 0) throw new Error("No usable prompts were parsed.");
      if (attempt === 0 && config.parserRetries > 0 && compactLorebookNeedsFullRetry(parsed, lorebookSnapshot)) {
        throw new Error("Compact lorebook context did not produce durable character tags; retrying with full lorebook context.");
      }
      break;
    } catch (error) {
      lastParserError = error;
      const classification = retryClassification(error);
      logStage(
        config,
        "parser_attempt_failed",
        { attempt, retries: config.parserRetries, classification, error: error instanceof Error ? error.message : String(error) },
        attempt >= config.parserRetries ? "error" : "warn"
      );
      if (attempt >= config.parserRetries || classification === "terminal") throw error;
      if (classification === "transient") await waitForParserRetry(attempt);
    }
  }
  if (!parsed) throw new Error(lastParserError instanceof Error ? lastParserError.message : "Parser did not return usable prompts.");
  return { parsed, selected };
}

async function persistCharacterMemory(
  chatId: string,
  parsed: ParsedPayload,
  config: Config,
  userId?: string
): Promise<void> {
  const committed = await updateState(chatId, userId, (state) => {
    updateCache(state.characterAppearance, parsed);
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
    negativeLengths: selected.map((entry) => entry.negative.length),
    perspectives: selected.map((entry) => ({ mode: entry.perspectiveMode, source: entry.perspectiveSource }))
  });
}

async function prepareAndDispatchImages(
  chatId: string,
  selected: PromptEntry[],
  config: Config,
  userId?: string,
  preparedImageConnection?: Promise<ImageConnection | null>
): Promise<PreparedImageStage> {
  const imageConnection = await (preparedImageConnection || resolveImageConnection(config, userId));
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
    const prompt = renderPrompt(entry.prompt, config.promptSyntax);
    const corePrompt = renderPrompt(entry.corePrompt, config.promptSyntax);
    const promptFormat = entry.corePrompt.format || "ordered";
    const parameters = await buildImageParameters(config, imageConnection, prompt, entry.negative || "");
    const job: PreparedImageJob = {
      index,
      total: selected.length,
      prompt,
      negative: entry.negative || "",
      corePrompt,
      shotNegative: entry.shotNegative,
      promptFormat,
      paragraph: entry.paragraph,
      parserParagraph: entry.parserParagraph,
      perspectiveMode: entry.perspectiveMode,
      perspectiveSource: entry.perspectiveSource,
      creativeConcept: entry.creativeConcept,
      creativeCandidates: entry.creativeCandidates,
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
  const negativePrompts = stage.jobs.map((job) => job.negative);
  const perspectiveModes = stage.jobs.map((job) => job.perspectiveMode || config.perspectiveMode);
  const perspectiveSources = stage.jobs.map((job) => job.perspectiveSource || "manual");
  const imageParameters = stage.jobs.map((job) => job.parameters);
  const corePrompts = stage.jobs.map((job) => job.corePrompt || "");
  const shotNegatives = stage.jobs.map((job) => job.shotNegative || "");
  const promptFormats = stage.jobs.map((job) => job.promptFormat || "ordered");
  const creativeConcepts = stage.jobs.map((job) => job.creativeConcept || null);
  const creativeConceptCandidates = stage.jobs.map((job) => job.creativeCandidates || []);
  const creativeConceptHistory = stage.jobs.map((job) => job.creativeConcept ? [job.creativeConcept.id] : []);
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
  return {
    prompts,
    negativePrompts,
    perspectiveModes,
    perspectiveSources,
    imageParameters,
    corePrompts,
    shotNegatives,
    promptFormats,
    creativeConcepts,
    creativeConceptCandidates,
    creativeConceptHistory,
    paragraphs,
    imageIds,
    imageUrls
  };
}

async function persistGeneration(input: PersistStageInput): Promise<GeneratedRecord> {
  const { chatId, messageId, swipeId, key, target, parsed, assets, visualState, config, userId } = input;
  const record: GeneratedRecord = {
    chatId,
    messageId,
    swipeId,
    prompts: assets.prompts,
    negativePrompts: assets.negativePrompts,
    perspectiveModes: assets.perspectiveModes,
    perspectiveSources: assets.perspectiveSources,
    imageParameters: assets.imageParameters,
    corePrompts: assets.corePrompts,
    shotNegatives: assets.shotNegatives,
    promptFormats: assets.promptFormats,
    creativeConcepts: assets.creativeConcepts,
    creativeConceptCandidates: assets.creativeConceptCandidates,
    creativeConceptHistory: assets.creativeConceptHistory,
    paragraphs: assets.paragraphs,
    imageIds: assets.imageIds,
    imageUrls: assets.imageUrls,
    rawJson: parsed,
    createdAt: new Date().toISOString()
  };
  const reference = await storeGeneratedRecord(chatId, key, record, userId);
  const committed = await updateState(chatId, userId, async (state) => {
    await migrateLegacyGeneratedRecords(chatId, state, userId);
    updateCache(state.characterAppearance, parsed);
    state.generated[key] = reference;
    if (visualState) state.previousVisualState = visualState;
    else delete state.previousVisualState;
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
  corePrompt: string;
  shotNegative: string;
  promptFormat: "legacy" | "ordered";
  paragraph: number;
  perspectiveMode: PromptEntry["perspectiveMode"];
  perspectiveSource: PromptEntry["perspectiveSource"];
  creativeConcept: CreativeConcept | null;
  creativeCandidates: CreativeConcept[];
  creativeConceptHistory: string[];
  parameters: Record<string, unknown>;
  imageId: string;
  imageUrl: string;
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
    committedRecord = {
      ...record,
      prompts: replaceAt(record.prompts, located.index, replacement.prompt, ""),
      negativePrompts: replaceAt(record.negativePrompts, located.index, replacement.negative, ""),
      perspectiveModes: replaceAt(record.perspectiveModes, located.index, replacement.perspectiveMode, "dynamic"),
      perspectiveSources: replaceAt(record.perspectiveSources, located.index, replacement.perspectiveSource, "manual"),
      imageParameters: replaceAt(record.imageParameters, located.index, replacement.parameters, {}),
      corePrompts: replaceAt(record.corePrompts, located.index, replacement.corePrompt, ""),
      shotNegatives: replaceAt(record.shotNegatives, located.index, replacement.shotNegative, ""),
      promptFormats: replaceAt(record.promptFormats, located.index, replacement.promptFormat, "ordered"),
      creativeConcepts: replaceAt(record.creativeConcepts, located.index, replacement.creativeConcept, null),
      creativeConceptCandidates: replaceAt(record.creativeConceptCandidates, located.index, replacement.creativeCandidates, []),
      creativeConceptHistory: replaceAt(record.creativeConceptHistory, located.index, replacement.creativeConceptHistory, []),
      paragraphs: replaceAt(record.paragraphs, located.index, replacement.paragraph, 1),
      imageIds: replaceAt(record.imageIds, located.index, replacement.imageId, ""),
      imageUrls: replaceAt(record.imageUrls, located.index, replacement.imageUrl, "")
    } satisfies GeneratedRecord;
    current.generated[located.key] = await storeGeneratedRecord(request.chatId, located.key, committedRecord, userId);
    if (parsedForMemory) updateCache(current.characterAppearance, parsedForMemory);
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
      const corePrompt = located.record.corePrompts?.[located.index] || "";
      const promptFormat = located.record.promptFormats?.[located.index]
        || (config.promptStyle === "default" ? "legacy" : "ordered");
      const prompt = corePrompt
        ? renderPromptWithCurrentAffixes(corePrompt, promptFormat, config)
        : located.record.prompts[located.index] || "";
      if (!prompt) throw new Error("The selected image has no stored prompt to reroll.");
      const shotNegative = located.record.shotNegatives?.[located.index] || "";
      const negative = renderNegativeWithCurrentSelection(shotNegative, promptFormat, config);
      const originalParameters = located.record.imageParameters?.[located.index]
        || await buildImageParameters(config, imageConnection, prompt, negative);
      const parameters = rerollImageParameters(originalParameters, imageConnection, prompt, negative);
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
        corePrompt,
        shotNegative,
        promptFormat,
        paragraph: located.record.paragraphs[located.index] || 1,
        perspectiveMode: located.record.perspectiveModes?.[located.index] || "dynamic",
        perspectiveSource: located.record.perspectiveSources?.[located.index] || "manual",
        creativeConcept: located.record.creativeConcepts?.[located.index] || null,
        creativeCandidates: located.record.creativeConceptCandidates?.[located.index] || [],
        creativeConceptHistory: located.record.creativeConceptHistory?.[located.index] || [],
        parameters,
        imageId,
        imageUrl
      };
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
        preprocessingEnabled: false,
        previousVisualStateEnabled: false
      };
      const paragraphs: PreparedParagraph[] = [{ ...sourceParagraph, parserIndex: 1 }];
      const storedCandidates = rebaseCreativeConcepts(
        located.record.creativeConceptCandidates?.[located.index] || [],
        1
      );
      const previousConceptHistory = located.record.creativeConceptHistory?.[located.index] || [];
      const selection = await parseAndSelectPrompts({
        chatId: request.chatId,
        messageId: located.record.messageId,
        messages,
        paragraphs,
        state: initialState,
        config: singleConfig,
        creativeCandidates: storedCandidates,
        usedCreativeConceptIds: previousConceptHistory,
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
        Promise.resolve(imageConnection)
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
        corePrompt: job.corePrompt || renderPrompt(entry.corePrompt, singleConfig.promptSyntax),
        shotNegative: job.shotNegative || entry.shotNegative,
        promptFormat: job.promptFormat || entry.corePrompt.format || "ordered",
        paragraph: originalParagraph,
        perspectiveMode: entry.perspectiveMode,
        perspectiveSource: entry.perspectiveSource,
        creativeConcept: entry.creativeConcept || null,
        creativeCandidates: entry.creativeCandidates || storedCandidates,
        creativeConceptHistory: entry.creativeConcept
          ? [...new Set([...previousConceptHistory, entry.creativeConcept.id])]
          : previousConceptHistory,
        parameters: job.parameters,
        imageId,
        imageUrl
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
    const { parsed, selected } = await parseAndSelectPrompts({ chatId, messageId, messages, paragraphs, state, config, userId });
    logParsedSelection(parsed, selected, paragraphs, config);
    try {
      const imageStage = await prepareAndDispatchImages(chatId, selected, config, userId, imageConnectionPromise);
      const assets = collectImageResults(imageStage, config);
      const visualState = buildPreviousVisualState(
        parsed,
        imageStage.jobs.map((job) => job.parserParagraph).filter((paragraph): paragraph is number => Number.isFinite(paragraph))
      );
      await persistGeneration({ chatId, messageId, swipeId, key, target, parsed, assets, visualState, config, userId });
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
