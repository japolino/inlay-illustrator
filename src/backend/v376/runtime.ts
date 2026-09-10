/**
 * V3.7.6 Runtime adapter and job mapper.
 * Bridges V3.7.6 parsed shots and compiled prompts to Lumiverse Spindle image generation jobs,
 * progressive generation contexts, and persisted record storage.
 */

import type { Config } from "../../shared/config.js";
import { isNovelAiConnection, v376OptionsFromConfig } from "../../shared/config.js";
import type { GeneratedRecordSlot, GeneratedRecordV3 } from "../generated-record.js";
import type { ImageConnection, ParsedPayload, PreparedImageJob, PreparedParagraph, State } from "../types.js";
import { buildImageParameters, rerollImageParameters } from "../images.js";
import { renderNegativeWithCurrentSelection, renderPromptWithCurrentAffixes } from "../prompt.js";
import type { V376CompiledShot, V376NativeCharacter, V376Options, V376Payload, V376Shot } from "./types.js";
import { compileV376Shot } from "./prompt.js";
import { loadV376Memory } from "./memory.js";

/**
 * Maps compiled V3.7.6 shots to PreparedImageJob structures.
 * Maps compiler 1-based paragraph indices (parserIndex) to existing PreparedParagraph.originalIndex.
 * Forwards native character arrays via job.parameters.characters / job.parameters.nativeCharacters.
 */
export async function mapV376ShotsToJobs(params: {
  compiledShots: V376CompiledShot[];
  paragraphs: PreparedParagraph[];
  config: Config;
  imageConnection: ImageConnection | null;
  v376Options?: V376Options;
}): Promise<PreparedImageJob[]> {
  const { compiledShots, paragraphs, config, imageConnection } = params;
  const options = params.v376Options ?? v376OptionsFromConfig(config);

  // Provider guard: reject NovelAI native character channels on non-NovelAI providers
  if (
    options.separator === "native" &&
    options.syntax === "nai" &&
    imageConnection &&
    !isNovelAiConnection(imageConnection)
  ) {
    const hasNative = compiledShots.some(
      (shot) => shot.nativeCharacters && shot.nativeCharacters.length > 0
    );
    if (hasNative) {
      throw new Error(
        `NovelAI native character channels are not supported by provider "${imageConnection.provider}". ` +
        `Please select "pipe" or "newline" prompt separator, or configure a NovelAI image connection.`
      );
    }
  }

  const jobs: PreparedImageJob[] = [];

  for (let index = 0; index < compiledShots.length; index++) {
    const shot = compiledShots[index]!;
    // Match source compiler paragraph (1-based parserIndex) to original document paragraph index
    const matched = paragraphs.find((p) => p.parserIndex === shot.paragraph);
    const targetParagraph = matched
      ? matched.originalIndex
      : (paragraphs[0]?.originalIndex ?? Math.max(1, shot.paragraph));

    // Extension-level cover visual is an explicit placement override;
    // source rawShot.placement represents comic panel/shot placement data.
    const isCover = (shot as unknown as Record<string, unknown>).placementType === "cover"
      || (shot as unknown as Record<string, unknown>).isCover === true;
    const placement = isCover ? "cover" as const : "paragraph" as const;

    const baseParameters = await buildImageParameters(
      config,
      imageConnection,
      shot.prompt,
      shot.negative || ""
    );

    const characters = shot.nativeCharacters && shot.nativeCharacters.length > 0
      ? shot.nativeCharacters.map((c) => ({
          prompt: c.prompt,
          negative: c.negative ?? ""
        }))
      : [];

    const parameters: Record<string, unknown> = {
      ...baseParameters,
      ...(characters.length > 0
        ? { characters, nativeCharacters: shot.nativeCharacters }
        : {})
    };

    const job: PreparedImageJob = {
      index,
      total: compiledShots.length,
      prompt: shot.prompt,
      negative: shot.negative || "",
      corePrompt: shot.corePrompt || shot.prompt,
      shotNegative: shot.negative || "",
      promptFormat: "legacy",
      placement,
      paragraph: targetParagraph,
      parserParagraph: shot.paragraph,
      perspectiveMode: "dynamic",
      perspectiveSource: "manual",
      parameters,
      rawShot: shot.rawShot,
      scenePlace: shot.scenePlace ?? shot.rawShot.place,
      nativeCharacters: shot.nativeCharacters,
      quote: shot.quote,
      panels: shot.panels,
      v376Options: options
    };

    jobs.push(job);
  }

  return jobs;
}

/**
 * Creates an initial progressive GeneratedRecordV3 for V3.7.6 pipeline.
 * Initializes all slots to "pending" with native character channels and source metadata preserved.
 */
export function createV376PendingRecord(params: {
  chatId: string;
  messageId: string;
  swipeId: number;
  sourceFingerprint: string;
  operationId: string;
  jobs: PreparedImageJob[];
  payload: V376Payload;
  options: V376Options;
}): GeneratedRecordV3 {
  const { chatId, messageId, swipeId, sourceFingerprint, operationId, jobs, payload, options } = params;

  const slots: GeneratedRecordSlot[] = jobs.map((job) => ({
    prompt: job.prompt,
    negativePrompt: job.negative,
    perspectiveMode: job.perspectiveMode ?? "dynamic",
    perspectiveSource: job.perspectiveSource ?? "manual",
    paragraph: job.paragraph,
    imageId: "",
    imageUrl: "",
    imageParameters: { ...(job.parameters || {}) },
    corePrompt: job.corePrompt ?? job.prompt,
    shotNegative: job.shotNegative ?? job.negative,
    promptFormat: job.promptFormat ?? "legacy",
    placement: job.placement ?? "paragraph",
    status: "pending",
    rawShot: job.rawShot,
    scenePlace: job.scenePlace,
    nativeCharacters: job.nativeCharacters,
    quote: job.quote,
    panels: job.panels,
    v376Options: job.v376Options ?? options
  }));

  return {
    schemaVersion: 3,
    chatId,
    messageId,
    swipeId,
    slots,
    operationId,
    generationStatus: "pending",
    sourceFingerprint,
    rawJson: payload as unknown as ParsedPayload,
    v376Payload: payload,
    v376Options: options,
    createdAt: new Date().toISOString()
  };
}

/**
 * Prepares parameters for fresh-seed single or bulk reroll.
 * Preserves stored native character channels, raw shot metadata, and affixes.
 * Fallback: Legacy records without stored nativeCharacters/rawShot channels retain their
 * flat prompt without artificial multi-character extraction.
 */
export async function prepareV376FreshReroll(params: {
  slot: GeneratedRecordSlot;
  config: Config;
  imageConnection: ImageConnection | null;
  appearanceMap?: Record<string, { tags?: string; negTags?: string }>;
  state?: State;
}): Promise<{
  prompt: string;
  negative: string;
  parameters: Record<string, unknown>;
  corePrompt?: string;
  nativeCharacters?: V376NativeCharacter[];
}> {
  const { slot, config, imageConnection } = params;

  // If raw source shot is preserved, recompile with latest affixes and config
  if (slot.rawShot && typeof slot.rawShot === "object") {
    const v376Options = v376OptionsFromConfig(config);
    const appearanceMap = params.appearanceMap ?? (params.state ? loadV376Memory(params.state) : undefined);
    const compiled = compileV376Shot(
      slot.rawShot as V376Shot,
      {
        ...v376Options,
        ...config,
        ...(appearanceMap ? { appearanceMap } : {}),
      },
      { parentPlace: slot.scenePlace ?? (slot.rawShot as V376Shot).place }
    );
    const prompt = compiled.prompt;
    const negative = compiled.negative;
    const corePrompt = compiled.corePrompt;
    if (
      v376Options.separator === "native" &&
      v376Options.syntax === "nai" &&
      imageConnection &&
      !isNovelAiConnection(imageConnection) &&
      compiled.nativeCharacters &&
      compiled.nativeCharacters.length > 0
    ) {
      throw new Error(
        `NovelAI native character channels are not supported by provider "${imageConnection.provider}". ` +
        `Please select "pipe" or "newline" prompt separator, or configure a NovelAI image connection.`
      );
    }

    const originalParameters = slot.imageParameters
      || await buildImageParameters(config, imageConnection, prompt, negative);
    const parameters = rerollImageParameters(originalParameters, imageConnection, prompt, negative);

    const characters = compiled.nativeCharacters && compiled.nativeCharacters.length > 0
      ? compiled.nativeCharacters.map((c) => ({
          prompt: c.prompt,
          negative: c.negative ?? ""
        }))
      : [];
    if (characters.length > 0) {
      parameters.characters = characters;
      parameters.nativeCharacters = compiled.nativeCharacters;
    } else {
      // Switching native -> pipe/newline: clear stale channels so prompt is not contradicted
      delete parameters.characters;
      delete parameters.nativeCharacters;
    }

    return {
      prompt,
      negative,
      parameters,
      corePrompt,
      nativeCharacters: compiled.nativeCharacters && compiled.nativeCharacters.length > 0 ? compiled.nativeCharacters : undefined
    };
  }

  // Fallback: Legacy records without stored rawShot retain their flat prompt without artificial multi-character extraction.
  const corePrompt = slot.corePrompt || "";
  const promptFormat = slot.promptFormat || (config.promptStyle === "default" ? "legacy" : "ordered");
  const prompt = corePrompt
    ? renderPromptWithCurrentAffixes(corePrompt, promptFormat, config)
    : slot.prompt || "";
  if (!prompt) {
    throw new Error("The selected image has no stored prompt to reroll.");
  }

  const shotNegative = slot.shotNegative || "";
  const negative = renderNegativeWithCurrentSelection(shotNegative, promptFormat, config);

  if (
    config.promptSeparator === "native" &&
    config.promptSyntax === "nai" &&
    imageConnection &&
    !isNovelAiConnection(imageConnection) &&
    slot.nativeCharacters &&
    slot.nativeCharacters.length > 0
  ) {
    throw new Error(
      `NovelAI native character channels are not supported by provider "${imageConnection.provider}". ` +
      `Please select "pipe" or "newline" prompt separator, or configure a NovelAI image connection.`
    );
  }

  const originalParameters = slot.imageParameters
    || await buildImageParameters(config, imageConnection, prompt, negative);
  const parameters = rerollImageParameters(originalParameters, imageConnection, prompt, negative);

  // Preserve native character channels if stored on slot or in parameters
  if (slot.nativeCharacters && Array.isArray(slot.nativeCharacters) && slot.nativeCharacters.length > 0) {
    parameters.characters = slot.nativeCharacters.map((c) => ({
      prompt: c.prompt,
      negative: c.negative ?? ""
    }));
    parameters.nativeCharacters = slot.nativeCharacters;
  } else if (Array.isArray(originalParameters.characters) && originalParameters.characters.length > 0) {
    parameters.characters = originalParameters.characters;
    if (Array.isArray(originalParameters.nativeCharacters)) {
      parameters.nativeCharacters = originalParameters.nativeCharacters;
    }
  }

  return { prompt, negative, parameters, corePrompt };
}
