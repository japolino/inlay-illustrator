import { effectiveGenerationConfig, type Config, type PerspectiveMode } from "../shared/config.js";
import { applyAvatarVisualSupplements, ensureAvatarVisualSupplement } from "./avatar-vision.js";
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
import { ContinuityStateSchema, reconcileContinuityState, type IllustrationPlan } from "./domain.js";
import { planFromParsedPayload } from "./plan-adapter.js";
import { resolveIllustrationPlan } from "./shot-resolution.js";
import { type GeneratedRecordV3 as GeneratedRecord, toGeneratedRecordV3 } from "./generated-record.js";
import { buildImageParameters, prepareAndDispatchImageJobs, rerollImageParameters, resolveImageConnection } from "./images.js";
import { logStage } from "./logging.js";
import { updateCharacterMemory } from "./memory.js";
import { stripInlayContent } from "./inlay-content.js";
import {
  abortError,
  enqueueGeneration,
  isAbortError,
  throwIfAborted,
  type GenerationOperation,
  type GenerationStage
} from "./operation-manager.js";
import { ignoredTagNames, paragraphCount, prepareParagraphs } from "./paragraphs.js";
import {
  continuityReference,
  formatTargetParagraphs,
  generateCreativeConcepts,
  parsePayloadWithRepair,
  parserInstruction,
  parserMessages,
  parserUserRequest,
  preprocessTarget,
  repairDynamicCameraDiversity,
  routedTargetSource,
  resolveParserConnection
} from "./parser.js";
import { compilePrompt, renderNegativeWithCurrentSelection, renderPrompt, renderPromptWithCurrentAffixes } from "./prompt.js";
import { imageUrlFromId, renderInlaidMessage } from "./rendering.js";
import { normalizeScenePayload, selectCoverPromptEntry, selectPromptEntries } from "./scenes.js";
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
  ImageConnection,
  ParsedPayload,
  ParserConnection,
  PreparedImageJob,
  PreparedParagraph,
  PromptEntry,
  State
} from "./types.js";
import { cleanArray, cleanString, keysOf } from "./utils.js";
import { applyPreviousVisualState, buildPreviousVisualState } from "./visual-state.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

type ImageGenerationResult = Awaited<ReturnType<typeof spindle.imageGen.generate>>;
type ParsedSelection = { parsed: ParsedPayload; selected: PromptEntry[]; plan?: IllustrationPlan | null };
type PreparedImageStage = { jobs: PreparedImageJob[]; results: ImageGenerationResult[] };

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
  signal?: AbortSignal;
  preparedParserConnection?: Promise<ParserConnection>;
  /** Fast Mode only: load the character card once when no durable character tags exist yet. */
  fastBootstrapCharacter?: boolean;
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
  return toGeneratedRecordV3(value);
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
    if (explicitIndex !== undefined && Number.isInteger(explicitIndex) && explicitIndex >= 0 && explicitIndex < record.slots.length) {
      const slot = record.slots[explicitIndex];
      const idMatches = !request.imageId || slot.imageId === request.imageId;
      const urlMatches = !request.imageUrl || sameImageUrl(slot.imageUrl, request.imageUrl);
      if (idMatches && urlMatches) return { key, record, index: explicitIndex };
    }
    const matchedIndex = record.slots.findIndex((slot) =>
      (request.imageId && slot.imageId === request.imageId)
      || (request.imageUrl && sameImageUrl(slot.imageUrl, request.imageUrl))
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
      && preferredIndex >= 0 && preferredIndex < record.slots.length) {
      const slot = record.slots[preferredIndex];
      const idMatches = !request.imageId || slot.imageId === request.imageId;
      const urlMatches = !request.imageUrl || sameImageUrl(slot.imageUrl, request.imageUrl);
      if (idMatches && urlMatches) return { key, record, index: preferredIndex };
    }
    const matchedIndex = record.slots.findIndex((slot) =>
      (request.imageId && slot.imageId === request.imageId)
      || (request.imageUrl && sameImageUrl(slot.imageUrl, request.imageUrl))
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
  const slot = located.record.slots[located.index];
  const concept = slot.creativeConcept;
  return {
    prompt: slot.prompt,
    negativePrompt: slot.negativePrompt,
    perspectiveMode: slot.perspectiveMode || null,
    perspectiveSource: slot.perspectiveSource || null,
    creativeConcept: concept ? `${concept.anchor}: ${concept.concept}` : ""
  };
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

async function waitForParserRetry(attempt: number, signal?: AbortSignal): Promise<void> {
  const delay = Math.min(1500, 250 * (2 ** attempt)) + Math.floor(Math.random() * 125);
  await new Promise<void>((resolve, reject) => {
    const complete = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const timeout = setTimeout(complete, delay);
    const cancel = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      reject(abortError());
    };
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
  });
}

export async function parseAndSelectPrompts(input: ParseStageInput): Promise<ParsedSelection> {
  const { chatId, messageId, messages, paragraphs, state, config, userId, signal } = input;
  throwIfAborted(signal);
  const targetIndex = Math.max(0, messages.findIndex((message) => message.id === messageId));
  let parsed: ParsedPayload | null = null;
  let selected: PromptEntry[] = [];
  let lastParserError: unknown = null;
  let conceptCandidates = [...(input.creativeCandidates || [])];
  let conceptSelections: Map<number, CreativeConcept> | null = null;
  let ideationAttempted = false;
  let creativeTarget: { source: string; selectedParagraphs: number[] } | null = null;
  let canonicalPlan: IllustrationPlan | null = null;
  const usedConceptIds = new Set(input.usedCreativeConceptIds || []);
  const manualCreative = !config.adaptiveMode && config.perspectiveMode === "creative";
  const creativePipeline = manualCreative || config.adaptiveMode;
  const [parserConnection, lorebookSnapshot, contextSources] = await Promise.all([
    input.preparedParserConnection || resolveParserConnection(config, userId),
    buildLorebookContextSnapshot(
      chatId,
      paragraphs.map((paragraph) => paragraph.text).join("\n\n"),
      config,
      userId
    ),
    loadParserContextSources(chatId, config, userId, {
      fastBootstrapCharacter: input.fastBootstrapCharacter === true
    })
  ]);
  await ensureAvatarVisualSupplement({
    chatId,
    character: contextSources.character,
    canonicalTags: state.characterAppearance,
    connection: parserConnection,
    config,
    state,
    userId,
    signal
  });

  for (let attempt = 0; attempt <= config.parserRetries; attempt += 1) {
    try {
      canonicalPlan = null;
      throwIfAborted(signal);
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
        if (config.fastMode) {
          logStage(config, "creative_ideation_skipped", { reason: "fast_mode", mode: "manual_creative" });
          // Fast Mode renders Creative shots directly from the main parser with
          // no concept slate; keep the selection empty so the creative-entry
          // filter below cannot discard parsed shots.
          conceptSelections = new Map();
        } else {
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
              userId,
              signal
            );
            ideationAttempted = true;
          }
          conceptSelections = chooseCreativeConcepts(conceptCandidates, usedConceptIds);
          if (conceptSelections.size === 0 && conceptCandidates.length > 0) {
            conceptSelections = chooseCreativeConcepts(conceptCandidates);
          }
        }
      }
      if (creativePipeline && creativeTarget === null) {
        const candidateParagraphs = new Set(conceptCandidates.map((concept) => concept.paragraph));
        if (manualCreative && config.preprocessingEnabled && candidateParagraphs.size > 0) {
          const selectedParagraphs = [...candidateParagraphs].sort((left, right) => left - right);
          const notes = selectedParagraphs.map((paragraph) => {
            const concept = conceptSelections?.get(paragraph)
              || conceptCandidates.find((candidate) => candidate.paragraph === paragraph);
            return `[P${paragraph}]: Visual thesis: ${concept?.concept || concept?.anchor || "selected Creative focal beat"}; Camera intent: ${concept?.camera || "identity-safe Creative framing"}`;
          });
          creativeTarget = {
            source: routedTargetSource(formatTargetParagraphs(paragraphs), {
              summary: notes.join("\n"),
              selectedParagraphs,
              cameraNotes: selectedParagraphs.map((paragraph) =>
                conceptSelections?.get(paragraph)?.camera
                || conceptCandidates.find((candidate) => candidate.paragraph === paragraph)?.camera
                || "identity-safe Creative framing"
              )
            }),
            selectedParagraphs
          };
          logStage(config, "creative_preprocessing_done", {
            candidateCount: conceptCandidates.length,
            selectedParagraphs
          });
        } else {
          creativeTarget = await preprocessTarget(parserConnection, config, paragraphs, context, userId, signal);
        }
      }
      const target = creativePipeline
        ? creativeTarget || {
          source: formatTargetParagraphs(paragraphs),
          selectedParagraphs: paragraphs.map((paragraph) => paragraph.parserIndex)
        }
        : await preprocessTarget(parserConnection, config, paragraphs, context, userId, signal);
      const targetSource = target.source;
      const instruction = parserInstruction(config, {
        hasPreviousVisualState: Boolean(config.previousVisualStateEnabled && state.previousVisualState)
      });
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
        userId,
        signal,
        {
          currentSource: formatTargetParagraphs(paragraphs),
          currentParagraphs: paragraphs.map((paragraph) => paragraph.parserIndex),
          allowedParagraphs: target.selectedParagraphs,
          requireDynamicProjection: config.promptStyle === "anima"
            && (config.adaptiveMode || config.perspectiveMode === "dynamic"),
          requireTerminalState: true
        }
      );
      parsed = applyPreviousVisualState(
        parsed,
        config.previousVisualStateEnabled ? state.previousVisualState : undefined
      );
      parsed = await repairDynamicCameraDiversity(parserConnection, config, parsed, targetSource, userId, signal);
      parsed = applyAvatarVisualSupplements(parsed, state.avatarVisualSupplements);
      if (config.adaptiveMode && config.fastMode) {
        logStage(config, "creative_ideation_skipped", { reason: "fast_mode", mode: "adaptive" });
        conceptSelections = new Map();
      } else if (config.adaptiveMode) {
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
              userId,
              signal
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

      const legacySelected = selected;
      const illustrationInput = planFromParsedPayload(
        parsed,
        config.previousVisualStateEnabled ? state.previousVisualState : undefined,
        paragraphs,
        config,
        conceptSelections || new Map(),
        legacySelected
      );
      canonicalPlan = resolveIllustrationPlan(illustrationInput);
      const resolvedByParagraph = new Map(canonicalPlan.shots.map((shot) => [shot.paragraph, shot]));
      selected = legacySelected.map((legacy) => {
        const resolved = resolvedByParagraph.get(legacy.parserParagraph);
        if (!resolved) throw new Error(`Canonical plan omitted selected paragraph P${legacy.parserParagraph}.`);
        const compiled = compilePrompt(resolved, config);
        return {
          ...compiled,
          placement: legacy.placement || "paragraph",
          paragraph: legacy.paragraph,
          parserParagraph: legacy.parserParagraph,
          creativeCandidates: legacy.creativeCandidates
        };
      });
      logStage(config, "canonical_plan_resolved", {
        shots: canonicalPlan.shots.length,
        characters: canonicalPlan.shots.reduce((total, shot) => total + shot.characters.length, 0),
        paragraphs: [...new Set(canonicalPlan.shots.map((shot) => shot.paragraph))],
        terminalCharacters: canonicalPlan.terminalContinuity.characters.length,
        renderer: "canonical"
      });
      const cover = selectCoverPromptEntry(parsed, paragraphs, config);
      if (cover) selected = [cover, ...selected];
      if (attempt === 0 && config.parserRetries > 0 && compactLorebookNeedsFullRetry(parsed, lorebookSnapshot)) {
        throw new Error("Compact lorebook context did not produce durable character tags; retrying with full lorebook context.");
      }
      break;
    } catch (error) {
      throwIfAborted(signal);
      lastParserError = error;
      const classification = retryClassification(error);
      logStage(
        config,
        "parser_attempt_failed",
        { attempt, retries: config.parserRetries, classification, error: error instanceof Error ? error.message : String(error) },
        attempt >= config.parserRetries ? "error" : "warn"
      );
      if (attempt >= config.parserRetries || classification === "terminal") throw error;
      if (classification === "transient") await waitForParserRetry(attempt, signal);
    }
  }
  if (!parsed) throw new Error(lastParserError instanceof Error ? lastParserError.message : "Parser did not return usable prompts.");
  return { parsed, selected, plan: canonicalPlan };
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
    placements: selected.map((entry) => entry.placement || "paragraph"),
    promptLengths: selected.map((entry) => renderPrompt(entry.prompt, config.promptSyntax).length),
    negativeLengths: selected.map((entry) => entry.negative.length),
    perspectives: selected.map((entry) => ({ mode: entry.perspectiveMode, source: entry.perspectiveSource }))
  });
}

type ProgressiveGenerationContext = {
  chatId: string;
  messageId: string;
  swipeId: number;
  key: string;
  sourceFingerprint: string;
  operation: GenerationOperation;
  config: Config;
  userId?: string;
};

type MessageCommitRegistry = { queues: Map<string, Promise<void>> };
const MESSAGE_COMMIT_REGISTRY_KEY = Symbol.for("inlay-illustrator.message-commit-queues");
const messageCommitGlobal = globalThis as unknown as Record<PropertyKey, unknown>;

function messageCommitQueues(): Map<string, Promise<void>> {
  const existing = messageCommitGlobal[MESSAGE_COMMIT_REGISTRY_KEY] as MessageCommitRegistry | undefined;
  if (existing?.queues instanceof Map) return existing.queues;
  const created: MessageCommitRegistry = { queues: new Map() };
  messageCommitGlobal[MESSAGE_COMMIT_REGISTRY_KEY] = created;
  return created.queues;
}

function enqueueMessageWrite<T>(
  userId: string | undefined,
  chatId: string,
  messageId: string,
  task: () => Promise<T>
): Promise<T> {
  const queues = messageCommitQueues();
  const queueKey = JSON.stringify([userId ?? null, chatId, messageId]);
  const previous = queues.get(queueKey) || Promise.resolve();
  const operation = previous.then(task, task);
  const tail = operation.then(() => undefined, () => undefined);
  queues.set(queueKey, tail);
  void tail.finally(() => {
    if (queues.get(queueKey) === tail) queues.delete(queueKey);
  });
  return operation;
}

function enqueueMessageCommit<T>(context: ProgressiveGenerationContext, task: () => Promise<T>): Promise<T> {
  return enqueueMessageWrite(context.userId, context.chatId, context.messageId, task);
}

export function sourceContentFingerprint(content: string): string {
  let left = 2166136261;
  let right = 2246822519;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    left = Math.imul(left ^ code, 16777619);
    right = Math.imul(right ^ code, 3266489917);
  }
  return `${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0).toString(16).padStart(8, "0")}`;
}

function reportGenerationProgress(
  operation: GenerationOperation,
  stage: GenerationStage,
  userId: string | undefined,
  detail?: string
): void {
  operation.stage = stage;
  spindle.sendToFrontend({
    type: "generation_progress",
    operationId: operation.id,
    chatId: operation.chatId,
    messageId: operation.messageId,
    stage,
    completed: operation.completed,
    total: operation.total,
    detail
  }, userId);
}

function pendingGenerationRecord(
  context: ProgressiveGenerationContext,
  selected: PromptEntry[],
  parsed: ParsedPayload,
  plan?: IllustrationPlan | null
): GeneratedRecord {
  return {
    schemaVersion: 3,
    chatId: context.chatId,
    messageId: context.messageId,
    swipeId: context.swipeId,
    slots: selected.map((entry) => ({
      prompt: renderPrompt(entry.prompt, context.config.promptSyntax),
      negativePrompt: entry.negative || "",
      perspectiveMode: entry.perspectiveMode,
      perspectiveSource: entry.perspectiveSource,
      paragraph: entry.paragraph,
      imageId: "",
      imageUrl: "",
      imageParameters: {},
      corePrompt: renderPrompt(entry.corePrompt, context.config.promptSyntax),
      shotNegative: entry.shotNegative,
      promptFormat: entry.corePrompt.format || "ordered",
      creativeConcept: entry.creativeConcept || null,
      creativeConceptCandidates: entry.creativeCandidates || [],
      creativeConceptHistory: entry.creativeConcept ? [entry.creativeConcept.id] : [],
      placement: entry.placement || "paragraph",
      status: "pending"
    })),
    operationId: context.operation.id,
    generationStatus: "pending",
    sourceFingerprint: context.sourceFingerprint,
    rawJson: parsed,
    ...(plan ? { illustrationPlan: plan } : {}),
    createdAt: new Date().toISOString()
  };
}

function currentSwipe(message: ChatMessage): number {
  return Number.isFinite(Number(message.swipe_id)) ? Number(message.swipe_id) : 0;
}

export function matchesGenerationSource(message: ChatMessage, swipeId: number, fingerprint: string): boolean {
  return message.role === "assistant"
    && currentSwipe(message) === swipeId
    && sourceContentFingerprint(stripInlayContent(String(message.content || ""))) === fingerprint;
}

function assertCurrentSource(message: ChatMessage | undefined, context: ProgressiveGenerationContext): asserts message is ChatMessage {
  if (!message || message.role !== "assistant") throw new Error("The source assistant message no longer exists.");
  if (currentSwipe(message) !== context.swipeId) throw new Error("The source message changed swipes while illustrations were generating.");
  if (!matchesGenerationSource(message, context.swipeId, context.sourceFingerprint)) {
    throw new Error("The source message was edited while illustrations were generating.");
  }
}

function recordMetadata(message: ChatMessage, record: GeneratedRecord): Record<string, unknown> {
  return {
    ...(message.metadata || {}),
    inlayIllustratorImageIds: record.slots.map((slot) => slot.imageId),
    inlayIllustratorParagraphs: record.slots.map((slot) => slot.paragraph),
    inlayIllustratorGeneratedAt: record.createdAt,
    inlayIllustratorOperationId: record.operationId,
    inlayIllustratorGenerationStatus: record.generationStatus
  };
}

async function renderProgressiveRecord(
  message: ChatMessage,
  record: GeneratedRecord,
  context: ProgressiveGenerationContext
): Promise<void> {
  await spindle.chat.updateMessage(context.chatId, context.messageId, {
    content: renderInlaidMessage(String(message.content || ""), record, context.config),
    metadata: recordMetadata(message, record),
    skipChunkRebuild: true
  });
}

async function initializeProgressiveGeneration(
  context: ProgressiveGenerationContext,
  record: GeneratedRecord
): Promise<void> {
  await enqueueMessageCommit(context, async () => {
    const messages = await spindle.chat.getMessages(context.chatId) as ChatMessage[];
    const current = messages.find((message) => message.id === context.messageId);
    assertCurrentSource(current, context);
    const reference = await storeGeneratedRecord(context.chatId, context.key, record, context.userId);
    const committed = await updateState(context.chatId, context.userId, async (state) => {
      await migrateLegacyGeneratedRecords(context.chatId, state, context.userId);
      updateCharacterMemory(state, record.rawJson);
      state.generated[context.key] = reference;
      rebuildGeneratedImageIndex(state);
    });
    await renderProgressiveRecord(current, record, context);
    spindle.sendToFrontend({
      type: "character_memory_updated",
      chatId: context.chatId,
      characterAppearance: committed.characterAppearance
    }, context.userId);
  });
}

async function mutateProgressiveGeneration(
  context: ProgressiveGenerationContext,
  mutate: (record: GeneratedRecord) => GeneratedRecord,
  mutateState?: (state: State, record: GeneratedRecord) => void
): Promise<GeneratedRecord> {
  return enqueueMessageCommit(context, async () => {
    const messages = await spindle.chat.getMessages(context.chatId) as ChatMessage[];
    const currentMessage = messages.find((message) => message.id === context.messageId);
    assertCurrentSource(currentMessage, context);
    let committedRecord: GeneratedRecord | null = null;
    await updateState(context.chatId, context.userId, async (state) => {
      const currentRecord = await loadGeneratedRecord(state.generated[context.key], context.userId, false);
      if (!currentRecord || currentRecord.operationId !== context.operation.id) {
        throw new Error("A newer illustration operation replaced this generation.");
      }
      committedRecord = mutate(currentRecord);
      state.generated[context.key] = await storeGeneratedRecord(
        context.chatId,
        context.key,
        committedRecord,
        context.userId
      );
      mutateState?.(state, committedRecord);
      rebuildGeneratedImageIndex(state);
    });
    const record = committedRecord as GeneratedRecord | null;
    if (!record) throw new Error("The progressive illustration record could not be persisted.");
    await renderProgressiveRecord(currentMessage, record, context);
    return record;
  });
}

async function commitProgressiveSlot(
  context: ProgressiveGenerationContext,
  job: PreparedImageJob,
  settlement: PromiseSettledResult<ImageGenerationResult>
): Promise<boolean> {
  const cancelled = context.operation.controller.signal.aborted;
  const providerResult = settlement.status === "fulfilled" ? settlement.value : null;
  const imageId = cancelled ? "" : providerResult?.imageId || "";
  const imageUrl = cancelled ? "" : providerResult?.imageUrl || (imageId ? imageUrlFromId(imageId) : "");
  const completed = Boolean(imageUrl);
  const status = cancelled ? "cancelled" : completed ? "completed" : "failed";
  const reason = settlement.status === "rejected"
    ? (settlement.reason instanceof Error ? settlement.reason.message : String(settlement.reason))
    : completed ? "" : "The image provider returned no image.";
  await mutateProgressiveGeneration(context, (record) => ({
    ...record,
    slots: record.slots.map((slot, index) => index === job.index ? {
      ...slot,
      prompt: job.prompt,
      negativePrompt: job.negative,
      perspectiveMode: job.perspectiveMode || context.config.perspectiveMode,
      perspectiveSource: job.perspectiveSource || "manual",
      imageParameters: job.parameters,
      corePrompt: job.corePrompt || "",
      shotNegative: job.shotNegative || "",
      promptFormat: job.promptFormat || "ordered",
      creativeConcept: job.creativeConcept || null,
      creativeConceptCandidates: job.creativeCandidates || [],
      placement: job.placement || "paragraph",
      paragraph: job.paragraph,
      imageId,
      imageUrl,
      status,
      error: reason.slice(0, 500)
    } : slot)
  }));
  return completed;
}

async function finalizeProgressiveGeneration(
  context: ProgressiveGenerationContext,
  parsed: ParsedPayload,
  successfulParserParagraphs: number[],
  cancelled: boolean,
  plan?: IllustrationPlan | null
): Promise<GeneratedRecord> {
  const visualState = successfulParserParagraphs.length > 0 && !plan
    ? buildPreviousVisualState(parsed, successfulParserParagraphs)
    : null;
  const validatedVisualState = plan
    ? ContinuityStateSchema.parse(plan.terminalContinuity)
    : visualState ? ContinuityStateSchema.parse(visualState) : null;
  const terminalParagraphMatch = String(parsed.terminalState?.paragraph ?? "").match(/\d+/);
  const continuityParagraph = terminalParagraphMatch
    ? Number(terminalParagraphMatch[0])
    : Math.max(1, ...successfulParserParagraphs);
  return mutateProgressiveGeneration(context, (record) => {
    const slots = record.slots.map((slot) => slot.status === "pending" || slot.status === "generating"
      ? { ...slot, status: cancelled ? "cancelled" as const : "failed" as const }
      : slot);
    const hasSuccess = slots.some((slot) => slot.status === "completed");
    return {
      ...record,
      slots,
      generationStatus: cancelled ? "cancelled" : hasSuccess ? "completed" : "failed"
    };
  }, (state) => {
    if (successfulParserParagraphs.length > 0) {
      if (validatedVisualState) {
        const terminal = {
          ...validatedVisualState,
          updatedAt: validatedVisualState.updatedAt || new Date().toISOString()
        };
        state.previousVisualState = plan
          ? ContinuityStateSchema.parse(terminal) as typeof state.previousVisualState
          : reconcileContinuityState(
            state.previousVisualState,
            terminal,
            continuityParagraph
          ) as typeof state.previousVisualState;
      } else delete state.previousVisualState;
    }
  });
}

async function prepareAndDispatchImages(
  chatId: string,
  selected: PromptEntry[],
  config: Config,
  userId?: string,
  preparedImageConnection?: Promise<ImageConnection | null>,
  options: {
    signal?: AbortSignal;
    stopWaitingOnAbort?: boolean;
    onSettled?: (job: PreparedImageJob, result: PromiseSettledResult<ImageGenerationResult>) => Promise<void> | void;
  } = {}
): Promise<PreparedImageStage> {
  throwIfAborted(options.signal);
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
      placement: entry.placement || "paragraph",
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
      userId,
      // The host persists the image and returns imageId/imageUrl; the base64
      // data URL is the largest per-image RPC payload and is never consumed.
      includeDataUrl: false
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
  }, options);
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
      slots: record.slots.map((slot, index) => index === located.index ? {
        ...slot,
        prompt: replacement.prompt,
        negativePrompt: replacement.negative,
        perspectiveMode: replacement.perspectiveMode,
        perspectiveSource: replacement.perspectiveSource,
        imageParameters: replacement.parameters,
        corePrompt: replacement.corePrompt,
        shotNegative: replacement.shotNegative,
        promptFormat: replacement.promptFormat,
        creativeConcept: replacement.creativeConcept,
        creativeConceptCandidates: replacement.creativeCandidates,
        creativeConceptHistory: replacement.creativeConceptHistory,
        paragraph: replacement.paragraph,
        imageId: replacement.imageId,
        imageUrl: replacement.imageUrl,
        status: "completed",
        error: ""
      } : slot)
    } satisfies GeneratedRecord;
    current.generated[located.key] = await storeGeneratedRecord(request.chatId, located.key, committedRecord, userId);
    if (parsedForMemory) updateCharacterMemory(current, parsedForMemory);
    rebuildGeneratedImageIndex(current);
  });
  const record = committedRecord as GeneratedRecord | null;
  if (!record || committedIndex < 0) throw new Error("The replacement image could not be persisted.");

  await enqueueMessageWrite(userId, request.chatId, record.messageId, async () => {
    const latestState = await getState(request.chatId, userId);
    const latestRecord = await loadGeneratedRecord(latestState.generated[committedKey], userId, false) || record;
    const messages = await spindle.chat.getMessages(request.chatId) as ChatMessage[];
    const target = messages.find((message) => message.id === record.messageId);
    if (!target) throw new Error("The source assistant message no longer exists.");
    await spindle.chat.updateMessage(request.chatId, record.messageId, {
      content: renderInlaidMessage(String(target.content || ""), latestRecord, config),
      metadata: recordMetadata(target, latestRecord),
      skipChunkRebuild: true
    });
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

    const originalSlot = located.record.slots[located.index];
    if (!originalSlot) throw new Error("The selected image slot no longer exists.");

    if (!rerunSidecar) {
      const corePrompt = originalSlot.corePrompt || "";
      const promptFormat = originalSlot.promptFormat
        || (config.promptStyle === "default" ? "legacy" : "ordered");
      const prompt = corePrompt
        ? renderPromptWithCurrentAffixes(corePrompt, promptFormat, config)
        : originalSlot.prompt || "";
      if (!prompt) throw new Error("The selected image has no stored prompt to reroll.");
      const shotNegative = originalSlot.shotNegative || "";
      const negative = renderNegativeWithCurrentSelection(shotNegative, promptFormat, config);
      const originalParameters = originalSlot.imageParameters
        || await buildImageParameters(config, imageConnection, prompt, negative);
      const parameters = rerollImageParameters(originalParameters, imageConnection, prompt, negative);
      const result = await spindle.imageGen.generate({
        connection_id: config.imageConnectionId || undefined,
        prompt,
        negativePrompt: negative || undefined,
        model: config.imageModel || undefined,
        parameters,
        owner_chat_id: request.chatId,
        userId,
        includeDataUrl: false
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
        paragraph: originalSlot.paragraph || 1,
        perspectiveMode: originalSlot.perspectiveMode || "dynamic",
        perspectiveSource: originalSlot.perspectiveSource || "manual",
        creativeConcept: originalSlot.creativeConcept || null,
        creativeCandidates: originalSlot.creativeConceptCandidates || [],
        creativeConceptHistory: originalSlot.creativeConceptHistory || [],
        parameters,
        imageId,
        imageUrl
      };
    } else {
      const messages = await spindle.chat.getMessages(request.chatId) as ChatMessage[];
      const target = messages.find((message) => message.id === located.record.messageId);
      if (!target) throw new Error("The source assistant message no longer exists.");
      const originalParagraph = originalSlot.paragraph || 1;
      const isCover = originalSlot.placement === "cover";
      const allParagraphs = prepareParagraphs(String(target.content || ""), config);
      const sourceParagraph = allParagraphs.find((paragraph) => paragraph.originalIndex === originalParagraph);
      if (!isCover && !sourceParagraph) throw new Error("The source paragraph for this image no longer exists.");
      if (isCover && allParagraphs.length === 0) throw new Error("The source message has no usable paragraphs for a cover prompt.");
      const singleConfig: Config = {
        ...effectiveGenerationConfig(config),
        coverImageEnabled: isCover,
        minImages: 1,
        maxImages: 1,
        preprocessingEnabled: false,
        previousVisualStateEnabled: false
      };
      const paragraphs: PreparedParagraph[] = isCover
        ? allParagraphs
        : [{ ...(sourceParagraph as PreparedParagraph), parserIndex: 1 }];
      const storedCandidates = rebaseCreativeConcepts(
        originalSlot.creativeConceptCandidates || [],
        1
      );
      const previousConceptHistory = originalSlot.creativeConceptHistory || [];
      const selection = await parseAndSelectPrompts({
        chatId: request.chatId,
        messageId: located.record.messageId,
        messages,
        paragraphs,
        state: initialState,
        config: singleConfig,
        creativeCandidates: storedCandidates,
        usedCreativeConceptIds: previousConceptHistory,
        userId,
        fastBootstrapCharacter: singleConfig.fastMode && singleConfig.includeCharacterInfo
          && Object.keys(initialState.characterAppearance).length === 0
      });
      selectionForMemory = selection.parsed;
      const entry = isCover
        ? selection.selected.find((candidate) => candidate.placement === "cover")
        : selection.selected.find((candidate) => candidate.placement !== "cover");
      if (!entry) throw new Error(isCover
        ? "The sidecar returned no usable replacement cover prompt."
        : "The sidecar returned no usable replacement prompt.");
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

async function runGenerationForMessage(
  chatId: string,
  messageId: string,
  content: string,
  operation: GenerationOperation,
  userId?: string,
  prepared?: { config?: Config; messages?: ChatMessage[] }
): Promise<void> {
  const generationStartedAt = Date.now();
  const signal = operation.controller.signal;
  let config: Config | null = null;
  let context: ProgressiveGenerationContext | null = null;
  let parsed: ParsedPayload | null = null;
  let canonicalPlan: IllustrationPlan | null = null;
  let initialized = false;
  let initializationPromise: Promise<void> | null = null;
  let releaseGeneration: (() => void) | null = null;
  const successfulParserParagraphs: number[] = [];
  try {
    throwIfAborted(signal);
    const storedConfig = prepared?.config || await getConfig(userId);
    config = effectiveGenerationConfig(storedConfig);
    logStage(config, "request_received", { chatId, messageId, contentLength: content.length, enabled: config.enabled, autoGenerate: config.autoGenerate });
    if (config.fastMode) {
      logStage(config, "fast_mode_applied", {
        configuredMinImages: storedConfig.minImages,
        configuredMaxImages: storedConfig.maxImages,
        effectiveMinImages: config.minImages,
        effectiveMaxImages: config.maxImages,
        recentContextSkipped: true,
        preprocessingSkipped: true,
        retriesDisabled: true,
        lorebookSkipped: storedConfig.includeLorebook && !config.includeLorebook
      });
    }
    if (!config.enabled) {
      logStage(config, "request_skipped", { reason: "disabled", chatId, messageId });
      return;
    }

    reportGenerationProgress(operation, "loading", userId);
    const messagesPromise = prepared?.messages
      ? Promise.resolve(prepared.messages)
      : spindle.chat.getMessages(chatId) as Promise<ChatMessage[]>;
    const statePromise = getState(chatId, userId);
    const imageConnectionPromise = resolveImageConnection(config, userId);
    const parserConnectionPromise = resolveParserConnection(config, userId);
    void imageConnectionPromise.catch(() => undefined);
    void parserConnectionPromise.catch(() => undefined);
    const [messages, state] = await Promise.all([messagesPromise, statePromise]);
    throwIfAborted(signal);
    const target = messages.find((message) => message.id === messageId);
    logStage(config, "target_checked", {
      found: Boolean(target),
      role: target?.role || null,
      ownMessage: target ? isOwnMessage(target) : false,
      messageCount: messages.length
    });
    if (!target || target.role !== "assistant" || isOwnMessage(target)) return;
    const swipeId = currentSwipe(target);
    const key = `${chatId}:${messageId}:${swipeId}`;
    const runningKey = JSON.stringify([userId ?? null, key]);
    releaseGeneration = tryAcquireRuntimeLock("generation", runningKey);
    if (!releaseGeneration) {
      logStage(config, "request_skipped", { reason: "already_running", key });
      return;
    }
    if (state.generated[key]) {
      const existing = await loadGeneratedRecord(state.generated[key], userId, false);
      const hasIncompleteSlot = existing?.slots.some((slot) => slot.status !== "completed") || false;
      if (!existing?.generationStatus || (existing.generationStatus === "completed" && !hasIncompleteSlot)) {
        logStage(config, "request_skipped", { reason: "already_generated", key });
        return;
      }
    }

    const sourceContent = stripInlayContent(String(target.content || content || ""));
    context = {
      chatId,
      messageId,
      swipeId,
      key,
      sourceFingerprint: sourceContentFingerprint(sourceContent),
      operation,
      config,
      userId
    };
    const paragraphs = prepareParagraphs(sourceContent, config);
    logStage(config, "paragraph_cleanup_done", {
      originalParagraphs: paragraphCount(sourceContent),
      parserParagraphs: paragraphs.length,
      mappedOriginalParagraphs: paragraphs.map((paragraph) => paragraph.originalIndex),
      ignoredTagCount: ignoredTagNames(config).length
    });
    if (paragraphs.length === 0) throw new Error("No usable paragraphs found for image parsing.");

    reportGenerationProgress(operation, "parsing", userId);
    const selection = await parseAndSelectPrompts({
      chatId,
      messageId,
      messages,
      paragraphs,
      state,
      config,
      userId,
      signal,
      preparedParserConnection: parserConnectionPromise,
      fastBootstrapCharacter: config.fastMode && config.includeCharacterInfo
        && Object.keys(state.characterAppearance).length === 0
    });
    parsed = selection.parsed;
    canonicalPlan = selection.plan || null;
    const selected = selection.selected;
    logParsedSelection(parsed, selected, paragraphs, config);
    operation.total = selected.length;
    reportGenerationProgress(operation, "preparing", userId);
    initializationPromise = initializeProgressiveGeneration(
      context,
      pendingGenerationRecord(context, selected, parsed, selection.plan)
    ).then(() => { initialized = true; });
    void initializationPromise.catch(() => undefined);
    reportGenerationProgress(operation, "generating", userId);

    await prepareAndDispatchImages(chatId, selected, config, userId, imageConnectionPromise, {
      signal,
      stopWaitingOnAbort: true,
      onSettled: async (job, settlement) => {
        if (signal.aborted) return;
        try {
          await initializationPromise;
          const completed = await commitProgressiveSlot(context as ProgressiveGenerationContext, job, settlement);
          if (completed && job.placement !== "cover" && Number.isFinite(job.parserParagraph)) {
            successfulParserParagraphs.push(job.parserParagraph as number);
          }
          operation.completed += 1;
          const illustrationNumber = selected[0]?.placement === "cover" ? job.index : job.index + 1;
          const subject = job.placement === "cover" ? "Cover image" : `Illustration ${illustrationNumber}`;
          reportGenerationProgress(operation, "generating", userId, completed
            ? `${subject} ready.`
            : `${subject} did not complete.`);
          if (settlement.status === "fulfilled" && !completed && !signal.aborted) {
            throw new Error("The image provider returned no image.");
          }
        } catch (error) {
          throw error;
        }
      }
    });

    await initializationPromise;
    throwIfAborted(signal);
    reportGenerationProgress(operation, "persisting", userId);
    const record = await finalizeProgressiveGeneration(context, parsed, successfulParserParagraphs, false, canonicalPlan);
    reportGenerationProgress(operation, "completed", userId);
    spindle.sendToFrontend({ type: "status", chatId, operationId: operation.id, status: "Generated", record }, userId);
    logStage(config, "generation_pipeline_done", {
      chatId,
      messageId,
      imageCount: record.slots.filter((slot) => Boolean(slot.imageUrl)).length,
      elapsedMs: Date.now() - generationStartedAt
    });
  } catch (error) {
    const cancelled = isAbortError(error, signal);
    if (!initialized && initializationPromise) {
      try {
        await initializationPromise;
      } catch {
        // The original pipeline error remains authoritative.
      }
    }
    if (initialized && context && parsed) {
      try {
        await finalizeProgressiveGeneration(context, parsed, successfulParserParagraphs, cancelled, canonicalPlan);
      } catch (finalizeError) {
        logStage(config || { debugLogging: true }, "progressive_finalize_error", {
          error: finalizeError instanceof Error ? finalizeError.message : String(finalizeError)
        }, "error");
      }
    }
    if (cancelled) {
      reportGenerationProgress(operation, "cancelled", userId);
      return;
    }
    reportGenerationProgress(operation, "failed", userId, error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    releaseGeneration?.();
  }
}

export async function generateForMessage(
  chatId: string,
  messageId: string,
  content: string,
  userId?: string,
  prepared?: { config?: Config; messages?: ChatMessage[] }
): Promise<void> {
  const scheduled = enqueueGeneration(
    userId,
    chatId,
    messageId,
    (operation) => runGenerationForMessage(chatId, messageId, content, operation, userId, prepared),
    `${messageId}:${sourceContentFingerprint(stripInlayContent(content))}`
  );
  if (!scheduled.reused) reportGenerationProgress(scheduled.operation, "queued", userId);
  return scheduled.promise;
}
