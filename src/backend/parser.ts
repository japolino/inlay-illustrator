import type { Config } from "../shared/config.js";
import {
  creativeIdeationInstruction,
  creativeIdeationRequest,
  parseCreativeConcepts
} from "./creative.js";
import { parserInstruction } from "./instructions.js";
import {
  auditDynamicCameraDiversity,
  cameraRepairInstruction,
  mergeDynamicCameraRepair,
  repairDynamicCameraDiversityLocally
} from "./camera-diversity.js";
import { logStage } from "./logging.js";
import { abortError, throwIfAborted } from "./operation-manager.js";
import {
  dedupeExactShotCharacters,
  normalizeAtomicCompositionTerms,
  normalizeScenePayload,
  recoverSceneParagraphs
} from "./scenes.js";
import type { CreativeConcept, ParsedPayload, ParserConnection, ParserContext, ParserGenerationRequest, PreparedParagraph, SceneJson, ShotJson } from "./types.js";
import { asRecord, cleanString, compactBlock, keysOf } from "./utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

const parserConnectionCache = new Map<string, { expiresAt: number; connection: ParserConnection }>();

function cacheParserConnection(key: string, connection: ParserConnection): void {
  if (parserConnectionCache.size >= 32) {
    const oldest = parserConnectionCache.keys().next().value;
    if (typeof oldest === "string") parserConnectionCache.delete(oldest);
  }
  parserConnectionCache.set(key, { expiresAt: Date.now() + 5000, connection });
}

export { parserInstruction };

export function formatTargetParagraphs(paragraphs: PreparedParagraph[]): string {
  return paragraphs.map((paragraph) => `[P${paragraph.parserIndex}]\n${paragraph.text}`).join("\n\n");
}

export function continuityReference(systemContext: string, recentContext: string): string {
  const references = [
    systemContext.trim(),
    recentContext.trim() ? `## Recent Assistant Context\n${recentContext.trim()}` : ""
  ].filter(Boolean);
  if (references.length === 0) return "";
  return [
    "# Continuity Reference Only",
    "Use this reference only to fill missing stable appearance, attire, location, still-current time/weather, lighting, background, and persistent-action details.",
    "The current numbered source is authoritative. Never restore outdated scene facts or copy an earlier camera angle or composition merely for continuity.",
    ...references
  ].join("\n\n");
}

export function parserUserRequest(targetSource: string, creativeConstraint = ""): string {
  return [
    "Create the requested image-prompt batch from the current numbered paragraph source below.",
    "Use only its narrative events. Return one raw JSON object with a top-level scenes array and no other text.",
    "## Current Numbered Paragraph Source",
    targetSource,
    creativeConstraint
  ].join("\n\n");
}

function extractText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const object = result as Record<string, unknown>;
    for (const key of ["content", "text", "message", "output"]) {
      if (typeof object[key] === "string") return object[key];
    }
  }
  return "";
}

function extractUsage(result: unknown): Record<string, number> {
  const usage = asRecord(asRecord(result).usage);
  const output: Record<string, number> = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens", "total_cached_tokens",
    "prompt_cache_hit_tokens", "prompt_cache_miss_tokens", "cache_write_tokens"]) {
    const value = Number(usage[key]);
    if (Number.isFinite(value)) output[key] = value;
  }
  const promptDetails = asRecord(usage.prompt_tokens_details);
  for (const key of ["cached_tokens", "cache_write_tokens"]) {
    const value = Number(promptDetails[key]);
    if (Number.isFinite(value)) output[key] = value;
  }
  return output;
}

function extractFinishReason(result: unknown): string {
  const object = asRecord(result);
  if (typeof object.finish_reason === "string") return object.finish_reason;
  const choices = Array.isArray(object.choices) ? object.choices : [];
  const first = asRecord(choices[0]);
  return typeof first.finish_reason === "string" ? first.finish_reason : "";
}

const FUZZY_KEYS = [
  "scenes", "place", "environmentChanges", "shots", "paragraph", "camera", "situation", "characters", "label", "age", "identity", "appearance", "body", "attire", "attireInferred", "visualChanges",
  "expression", "action", "composition", "sharedComposition", "environment", "location", "timeWeather", "lightingMood", "backgroundElements",
  "framing", "angle", "perspective", "focus", "position", "pose", "actions", "gaze", "interaction", "spatialRelation",
  "negative", "name", "scene", "positive", "quote", "supplement", "perspectiveMode", "renderScope", "visibleTags",
  "shotPlan", "primaryAction", "secondaryCue", "staging", "terminalState"
];

function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_value, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(
        next[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = next;
  }
  return previous[b.length];
}

function fuzzyKey(key: string): string {
  if (FUZZY_KEYS.includes(key)) return key;
  let best = key;
  let bestDistance = 3;
  for (const candidate of FUZZY_KEYS) {
    const distance = levenshtein(key.toLowerCase(), candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= 2 ? best : key;
}

function fuzzyRepair(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => fuzzyRepair(item));
  if (!value || typeof value !== "object") return value;
  const repaired: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const fixed = fuzzyKey(key);
    repaired[repaired[fixed] === undefined ? fixed : key] = fuzzyRepair(child);
  }
  return repaired;
}

function hasScenes(value: unknown): value is ParsedPayload {
  return Boolean(value && typeof value === "object" && Array.isArray((value as ParsedPayload).scenes));
}

function tryParseObject(text: string): unknown | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? fuzzyRepair(parsed) : null;
  } catch {
    return null;
  }
}

function stripJsonFences(text: string): string {
  return text.replace(/```(?:json|JSON)?/g, "").replace(/```/g, "").trim();
}

function balancedObjects(text: string): string[] {
  const objects: string[] = [];
  const starts: number[] = [];
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") inString = false;
      continue;
    }
    if (character === "\"") {
      inString = true;
      continue;
    }
    if (character === "{") starts.push(index);
    else if (character === "}" && starts.length > 0) {
      const start = starts.pop();
      if (start !== undefined) objects.push(text.slice(start, index + 1));
    }
  }
  return [...new Set(objects.sort((left, right) => right.length - left.length))];
}

/** Parses a raw sidecar response using the production JSON recovery path. */
export function parseParserJson(text: string): ParsedPayload {
  const trimmed = text.trim().replace(/\\\(/g, "(").replace(/\\\)/g, ")");
  const whole = tryParseObject(trimmed);
  if (hasScenes(whole)) return whole;

  const candidates = balancedObjects(stripJsonFences(trimmed));
  for (const candidate of candidates) {
    const parsed = tryParseObject(candidate);
    if (hasScenes(parsed)) return parsed;
  }

  const collectedGroups: SceneJson[] = [];
  const collectedShots: SceneJson[] = [];
  for (const candidate of candidates) {
    const parsed = tryParseObject(candidate);
    if (!parsed || typeof parsed !== "object") continue;
    const object = parsed as SceneJson;
    if (Array.isArray(object.shots)) collectedGroups.push(object);
    else if (object.paragraph !== undefined) collectedShots.push(object);
  }
  if (collectedGroups.length > 0) return { scenes: collectedGroups };
  if (collectedShots.length > 0) return { scenes: collectedShots };
  throw new Error("Parser did not return usable JSON scenes.");
}

function staticShot(shot: ShotJson, config: Config): boolean {
  if (!config.adaptiveMode) return config.perspectiveMode === "static";
  return cleanString(shot.perspectiveMode).toLowerCase() === "static";
}

function dynamicShot(shot: ShotJson, config: Config): boolean {
  if (!config.adaptiveMode) return config.perspectiveMode === "dynamic";
  return cleanString(shot.perspectiveMode).toLowerCase() === "dynamic";
}

const GENERIC_LOCATION_WORDS = new Set([
  "background", "inside", "interior", "indoor", "indoors", "outside", "exterior", "outdoor", "outdoors", "room"
]);

function isSpecificLocation(value: unknown): boolean {
  const words = cleanString(value).toLowerCase().match(/[a-z]+/g) || [];
  return words.some((word) => !GENERIC_LOCATION_WORDS.has(word));
}

function isConcreteStaticPose(value: unknown): boolean {
  const pose = cleanString(value);
  return Boolean(pose) && !/\bpos(?:e|es|ed|ing)\b/i.test(pose);
}

function staticPayloadIssues(payload: ParsedPayload, config: Config): string[] {
  if (config.promptStyle !== "anima") return [];
  const issues: string[] = [];
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  scenes.forEach((scene, sceneIndex) => {
    const shots = Array.isArray(scene.shots) ? scene.shots : [scene];
    const staticShots = shots.filter((shot) => staticShot(shot, config));
    if (staticShots.length === 0) return;
    const environment = asRecord(scene.environment);
    if (!isSpecificLocation(environment.location)) issues.push(`scene ${sceneIndex + 1} needs a specific physical environment.location`);
    const backgroundElements = Array.isArray(environment.backgroundElements)
      ? environment.backgroundElements.map(cleanString).filter(Boolean)
      : [];
    if (backgroundElements.length < 2 || backgroundElements.length > 3) {
      issues.push(`scene ${sceneIndex + 1} needs 2-3 concrete environment.backgroundElements`);
    }
    staticShots.forEach((shot, shotIndex) => {
      const characters = Array.isArray(shot.characters) ? shot.characters : [];
      if (characters.length === 0) {
        issues.push(`scene ${sceneIndex + 1} Static shot ${shotIndex + 1} needs a primary character`);
      }
      characters.forEach((character, characterIndex) => {
        const composition = asRecord(character.composition);
        if (!isConcreteStaticPose(composition.pose)) {
          issues.push(`scene ${sceneIndex + 1} Static shot ${shotIndex + 1} character ${characterIndex + 1} needs a concrete resting composition.pose`);
        }
        const actions = Array.isArray(composition.actions)
          ? composition.actions.map(cleanString).filter(Boolean)
          : cleanString(composition.actions) ? [cleanString(composition.actions)] : [];
        if (actions.length > 0) {
          issues.push(`scene ${sceneIndex + 1} Static shot ${shotIndex + 1} character ${characterIndex + 1} must have an empty composition.actions array`);
        }
      });
    });
  });
  return issues;
}

function staticRepairInstruction(issues: string[]): string {
  return [
    "Repair this valid JSON so every Static shot satisfies the listed semantic requirements. Return only valid JSON and preserve all source facts, character baselines, expressions, and scene meaning.",
    "For every Static character, composition.pose must directly describe one concrete source-supported resting body arrangement, composition.actions must be an empty array, and gaze may remain source-supported or empty.",
    "For every scene containing a Static shot, environment.location must name a specific physical setting rather than indoor/outdoor, and environment.backgroundElements must contain 2-3 concrete visible setting details.",
    "Do not use abstract pose language such as simple pose, stable pose, holding a pose, or posing.",
    `Problems to repair:\n- ${issues.join("\n- ")}`
  ].join("\n");
}

const ATOMIC_DIRECTION_END = /[.!?:,;]\s*$/;

function dynamicPayloadIssues(payload: ParsedPayload, config: Config, required = true): string[] {
  if (config.promptStyle !== "anima" || !required) return [];
  const issues: string[] = [];
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  scenes.forEach((scene, sceneIndex) => {
    const shots = Array.isArray(scene.shots) ? scene.shots : [scene];
    shots.forEach((shot, shotIndex) => {
      if (!dynamicShot(shot, config)) return;
      const plan = asRecord(shot.shotPlan);
      const primaryAction = cleanString(plan.primaryAction);
      if (!primaryAction) {
        issues.push(`scene ${sceneIndex + 1} Dynamic shot ${shotIndex + 1} needs shotPlan.primaryAction`);
      }
      for (const field of ["primaryAction", "secondaryCue", "staging"] as const) {
        const value = cleanString(plan[field]);
        if (value && (value.includes(",") || value.includes(";") || ATOMIC_DIRECTION_END.test(value))) {
          issues.push(`scene ${sceneIndex + 1} Dynamic shot ${shotIndex + 1} shotPlan.${field} must be one atomic comma-free phrase`);
        }
      }
      const characters = Array.isArray(shot.characters) ? shot.characters : [];
      characters.forEach((character, characterIndex) => {
        if (!cleanString(character.renderScope)) {
          issues.push(`scene ${sceneIndex + 1} Dynamic shot ${shotIndex + 1} character ${characterIndex + 1} needs renderScope`);
        }
        if (!cleanString(character.visibleTags)) {
          issues.push(`scene ${sceneIndex + 1} Dynamic shot ${shotIndex + 1} character ${characterIndex + 1} needs visibleTags`);
        }
      });
    });
  });
  return issues;
}

function dynamicRepairInstruction(issues: string[]): string {
  return [
    "Repair this valid JSON so every Dynamic shot has a compact rendering projection. Return only valid JSON and preserve every source fact, paragraph, character object, baseline field, expression, composition action owner, shared interaction, environment value, and camera.",
    "Add or repair only shotPlan, renderScope, and visibleTags unless syntax repair requires otherwise.",
    "shotPlan.primaryAction is one comma-free role-bound subject-verb-object clause selecting the single action or interaction that should dominate the image. Preserve its explicit owner, target or object, and movement direction.",
    "shotPlan.secondaryCue is empty or one comma-free lower-priority visible gaze, reaction, hazard, or environmental-contact cue. shotPlan.staging is one comma-free spatial arrangement and contains no new action.",
    "renderScope states what the existing camera actually contains. visibleTags contains only stable appearance, body, and attire traits visible in that crop; it contains no expression, action, camera, environment, name, or subject-count tag.",
    "Do not add a character, action, contact, emotion, outfit, prop, or event.",
    `Problems to repair:\n- ${issues.join("\n- ")}`
  ].join("\n");
}

function modePayloadIssues(payload: ParsedPayload, config: Config, requireDynamicProjection = true): string[] {
  return [...staticPayloadIssues(payload, config), ...dynamicPayloadIssues(payload, config, requireDynamicProjection)];
}

function modeRepairInstruction(
  payload: ParsedPayload,
  config: Config,
  issues: string[],
  requireDynamicProjection = true
): string {
  const hasDynamic = dynamicPayloadIssues(payload, config, requireDynamicProjection).length > 0;
  const hasStatic = staticPayloadIssues(payload, config).length > 0;
  if (hasDynamic && !hasStatic) return dynamicRepairInstruction(issues);
  if (hasStatic && !hasDynamic) return staticRepairInstruction(issues);
  return [
    "Repair this valid JSON so its Static and Dynamic shots satisfy the listed mode-specific semantic requirements. Return only valid JSON and preserve all source facts and continuity values.",
    staticRepairInstruction(staticPayloadIssues(payload, config)),
    dynamicRepairInstruction(dynamicPayloadIssues(payload, config, requireDynamicProjection))
  ].join("\n\n");
}

function currentSourceText(messages: ParserGenerationRequest["messages"]): string {
  const request = messages.find((message) => message.role === "user" && message.content.includes("## Current Numbered Paragraph Source"));
  if (!request) return "";
  return request.content
    .split("## Current Numbered Paragraph Source", 2)[1]
    ?.split(/## (?:Selected Creative Concepts|Optional Creative Candidates)/i, 1)[0] || "";
}

function currentParagraphReferences(messages: ParserGenerationRequest["messages"]): number[] {
  const source = currentSourceText(messages).split("## Non-authoritative Shot-Router Notes", 1)[0] || "";
  return [...new Set([...source.matchAll(/\[P(\d+)\]/gi)].map((match) => Number(match[1])).filter(Number.isFinite))];
}

function routedParagraphReferences(messages: ParserGenerationRequest["messages"]): number[] {
  const source = currentSourceText(messages);
  const notes = source.split("## Non-authoritative Shot-Router Notes", 2)[1] || "";
  return [...new Set([...notes.matchAll(/^\[P(\d+)\]\s*:/gim)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite))];
}

function structuralPayloadIssues(payload: ParsedPayload, allowedParagraphs: number[]): string[] {
  const normalized = normalizeScenePayload(payload);
  if (normalized.length === 0) return ["no scene contains a shot with a usable paragraph reference"];
  if (allowedParagraphs.length > 0) {
    const invalid = [...new Set(normalized
      .map((entry) => entry.parserParagraph)
      .filter((paragraph) => !allowedParagraphs.includes(paragraph)))];
    if (invalid.length > 0) {
      return [`shots reference unselected or invalid paragraphs (${invalid.map((paragraph) => `P${paragraph}`).join(", ")}); allowed references are ${allowedParagraphs.map((paragraph) => `P${paragraph}`).join(", ")}`];
    }
    if (!normalized.some((entry) => allowedParagraphs.includes(entry.parserParagraph))) {
      return [`no shot references an allowed paragraph (${allowedParagraphs.map((paragraph) => `P${paragraph}`).join(", ")})`];
    }
  }
  return [];
}

function structuralRepairInstruction(issues: string[], allowedParagraphs: number[]): string {
  return [
    "Repair this JSON into the required scenes-and-shots structure. Return only valid JSON and preserve all existing scene, character, camera, and environment details.",
    "Every shot must contain a numeric paragraph field referencing one of the current numbered source paragraphs.",
    allowedParagraphs.length > 0
      ? `Allowed paragraph references: ${allowedParagraphs.map((paragraph) => `P${paragraph}`).join(", ")}.`
      : "Do not invent paragraph references.",
    `Problems to repair:\n- ${issues.join("\n- ")}`
  ].join("\n");
}

export async function resolveParserConnection(config: Config, userId?: string): Promise<ParserConnection> {
  logStage(config, "parser_connection_resolve_start", { configuredConnectionId: config.parserConnectionId, modelOverride: Boolean(config.parserModel) });
  if (!config.parserConnectionId) throw new Error("Select a parser connection before generating.");
  const cacheKey = JSON.stringify([userId ?? null, config.parserConnectionId]);
  const cached = parserConnectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.connection;
  const connection = await spindle.connections.get(config.parserConnectionId, userId);
  if (!connection) throw new Error("Parser connection not found.");
  logStage(config, "parser_connection_resolved", {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    connectionModel: connection.model,
    effectiveModel: config.parserModel || connection.model
  });
  const resolved = { id: connection.id, name: connection.name, provider: connection.provider, model: connection.model };
  cacheParserConnection(cacheKey, resolved);
  return resolved;
}

export type ParserStage = "main" | "ideation" | "preprocess" | "repair" | "camera";
const unsupportedStructuredOutput = new Set<string>();

/** Matches production output budgets while reserving room for reasoning-heavy compatible models. */
export function parserStageTokenBudget(model: string, config: Config, stage: ParserStage): number {
  if (config.parserMaxTokens > 0) return config.parserMaxTokens;
  const budgets: Record<ParserStage, number> = {
    main: Math.min(7000, 1800 + Math.max(1, config.maxImages) * 900),
    ideation: Math.min(5000, 1200 + Math.max(1, config.maxImages) * 700),
    preprocess: 2400,
    repair: Math.min(6000, 1600 + Math.max(1, config.maxImages) * 800),
    camera: 1800
  };
  const base = budgets[stage];
  if (/kimi[^\n]*k2[.\-_ ]?7[^\n]*code/i.test(model)) {
    if (stage === "main") return Math.max(base, 16000);
    if (stage === "repair") return Math.max(base, 12000);
    return Math.max(base, 8000);
  }
  if (/claude[^\n]*sonnet[^\n]*5/i.test(model)) {
    if (stage === "main") return Math.max(base, 9000);
    if (stage === "ideation") return Math.max(base, 5000);
    if (stage === "preprocess") return Math.max(base, 4000);
    if (stage === "repair") return Math.max(base, 7000);
    if (stage === "camera") return Math.max(base, 4000);
  }
  if (!/deepseek[^\n]*v4[^\n]*pro/i.test(model)) return base;
  if (stage === "main") return Math.max(base, 9000);
  if (stage === "ideation") return Math.max(base, 5000);
  if (stage === "preprocess") return Math.max(base, 4000);
  if (stage === "repair") return Math.max(base, 7000);
  if (stage === "camera") return Math.max(base, 4000);
  return base;
}

function parserStageParameters(
  connection: ParserConnection,
  config: Config,
  stage: ParserStage,
  structured = stage !== "preprocess"
): { parameters: Record<string, unknown>; injectedStructuredOutput: boolean } {
  const parameters = { ...config.parserParameters };
  if (parameters.max_tokens === undefined && parameters.max_completion_tokens === undefined) {
    parameters.max_tokens = parserStageTokenBudget(config.parserModel || connection.model, config, stage);
  }
  const capabilityKey = JSON.stringify([connection.provider, config.parserModel || connection.model]);
  const providerModel = `${connection.provider} ${config.parserModel || connection.model}`.toLowerCase();
  const canRequestJson = /openai|gpt-|gemini|deepseek/.test(providerModel);
  const injectedStructuredOutput = structured && canRequestJson && parameters.response_format === undefined
    && !unsupportedStructuredOutput.has(capabilityKey);
  if (injectedStructuredOutput) parameters.response_format = { type: "json_object" };
  return { parameters, injectedStructuredOutput };
}

async function generateParserText(
  connection: ParserConnection,
  config: Config,
  messages: ParserGenerationRequest["messages"],
  userId?: string,
  stage: ParserStage = "main",
  signal?: AbortSignal
): Promise<string> {
  const startedAt = Date.now();
  const selected = parserStageParameters(connection, config, stage);
  const run = async (parameters: Record<string, unknown>): Promise<unknown> => {
    throwIfAborted(signal);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      return await spindle.generate.raw({
        type: "raw",
        provider: connection.provider,
        model: config.parserModel || connection.model,
        connection_id: connection.id,
        messages,
        parameters,
        reasoning: { source: "off" },
        userId,
        signal: controller.signal
      } as ParserGenerationRequest);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  };
  try {
    logStage(config, "parser_llm_start", {
      provider: connection.provider,
      model: config.parserModel || connection.model,
      connectionId: connection.id,
      stage,
      parameterKeys: keysOf(selected.parameters),
      messageCount: messages.length,
      messageLengths: messages.map((message) => message.content.length)
    });
    let result: unknown;
    try {
      result = await run(selected.parameters);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!selected.injectedStructuredOutput || !/\b400\b|invalid.*(?:response|argument|format)|response_format/i.test(reason)) throw error;
      const capabilityKey = JSON.stringify([connection.provider, config.parserModel || connection.model]);
      unsupportedStructuredOutput.add(capabilityKey);
      const fallbackParameters = { ...selected.parameters };
      delete fallbackParameters.response_format;
      logStage(config, "parser_structured_output_fallback", { stage, reason }, "warn");
      result = await run(fallbackParameters);
    }
    const text = extractText(result);
    const usage = extractUsage(result);
    const finishReason = extractFinishReason(result);
    logStage(config, "parser_llm_done", {
      stage,
      outputLength: text.length,
      elapsedMs: Date.now() - startedAt,
      ...(finishReason ? { finishReason } : {}),
      ...(Object.keys(usage).length ? { usage } : {})
    });
    if (finishReason === "length" && !text.trim()) throw new Error("Parser response was truncated before producing JSON.");
    return text;
  } catch (error) {
    if (signal?.aborted) throw abortError(typeof signal.reason === "string" ? signal.reason : undefined);
    logStage(config, "parser_llm_error", {
      stage,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    }, "error");
    throw new Error(`Parser generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function generateCreativeConcepts(
  parserConnection: ParserConnection,
  config: Config,
  paragraphs: PreparedParagraph[],
  targetSource: string,
  context: ParserContext,
  previousConcepts: string[] = [],
  userId?: string,
  signal?: AbortSignal
): Promise<CreativeConcept[]> {
  try {
    logStage(config, "creative_ideation_start", {
      paragraphCount: paragraphs.length,
      previousConceptCount: previousConcepts.length,
      adaptiveMode: config.adaptiveMode
    });
    const raw = await generateParserText(parserConnection, config, parserMessages(
      creativeIdeationInstruction(config, previousConcepts),
      continuityReference(context.preprocessingSystemContext ?? context.systemContext, context.recentContext),
      creativeIdeationRequest(targetSource),
      context.override,
      "auxiliary"
    ), userId, "ideation", signal);
    const concepts = parseCreativeConcepts(raw, paragraphs, config);
    if (concepts.length === 0) {
      logStage(config, "creative_ideation_fallback", { reason: "invalid_or_empty_slate", outputLength: raw.length }, "warn");
      return [];
    }
    logStage(config, "creative_ideation_done", {
      candidateCount: concepts.length,
      paragraphCount: new Set(concepts.map((concept) => concept.paragraph)).size,
      scores: concepts.map((concept) => concept.score)
    });
    return concepts;
  } catch (error) {
    throwIfAborted(signal);
    logStage(config, "creative_ideation_fallback", {
      reason: error instanceof Error ? error.message : String(error)
    }, "warn");
    return [];
  }
}

export function parserMessages(
  stableInstruction: string,
  referenceContext: string,
  userRequest: string,
  override: string,
  stage: "parser" | "auxiliary" = "parser"
): ParserGenerationRequest["messages"] {
  const messages: ParserGenerationRequest["messages"] = [{ role: "system", content: stableInstruction.trim() }];
  if (referenceContext.trim()) messages.push({ role: "system", content: referenceContext.trim() });
  messages.push({ role: "user", content: userRequest.trim() });
  if (override.trim()) messages.push({
    role: "user",
    content: [
      "Final user instructions override lower-priority parser guidance when they do not conflict with valid JSON output.",
      stage === "parser"
        ? "If they add or replace durable tags for a character, put those tags in appearance, body, or attire and list each affected field in that character's visualChanges so deterministic continuity preserves the requested change. Do not put those tags only in identity."
        : "",
      override.trim()
    ].filter(Boolean).join("\n\n")
  });
  return messages;
}

export function preprocessingInstruction(paragraphs: PreparedParagraph[], config: Config): string {
  const minimum = Math.min(config.minImages, paragraphs.length);
  const maximum = Math.min(config.maxImages, paragraphs.length);
  const perspectiveGuidance = config.adaptiveMode
    ? "Select varied candidates that give the main parser strong options for Creative, Static, or Dynamic treatment."
    : config.perspectiveMode === "creative"
      ? "Favor concrete but easily overlooked visual anchors: partial subjects, objects, reflections, silhouettes, foreground fragments, environmental details, or unusual spatial relationships."
      : config.perspectiveMode === "asset"
        ? "One shot per selected paragraph, each containing exactly one visible character."
      : config.perspectiveMode === "static"
        ? "Favor stable clearly readable beats with conventional framing, limited motion, and limited occlusion."
        : "Favor significant visible action, movement, interaction, and cinematic changes.";
  return [
    "# Illustration Shot Router",
    "Select the strongest source paragraphs and give the final mode-specific parser a non-authoritative directing note. Never replace, rewrite, or summarize away the original source facts.",
    `Select between ${minimum} and ${maximum} unique paragraphs.`,
    "Choose paragraphs with the most significant visual changes, actions, interactions, location changes, or emotional beats across the whole source. Do not favor early paragraphs by default.",
    perspectiveGuidance,
    "Output plain text only with exactly one line per selected paragraph in this form:",
    "[P#]: Visual thesis: one decisive visible idea; Camera intent: concrete framing and viewpoint",
    "Use each selected [P#] once. Do not invent or alter paragraph numbers.",
    "Every selected line must include a non-empty Visual thesis and Camera intent.",
    "Use concise objective English. Do not output character baselines, rewritten narrative, markdown, greetings, or explanations."
  ].join("\n\n");
}

export function preprocessingUserRequest(rawTarget: string): string {
  return ["Edit these current numbered paragraphs into the requested visual-beat selection:", rawTarget].join("\n\n");
}

export type PreprocessedSelection = { summary: string; selectedParagraphs: number[]; cameraNotes: string[] };

export function routedTargetSource(rawTarget: string, selection: PreprocessedSelection): string {
  return [
    rawTarget,
    "## Non-authoritative Shot-Router Notes",
    selection.summary,
    "Create illustration scenes and shots only for the selected [P#] references above. Read every original numbered paragraph for terminalState and continuity. The original paragraphs are authoritative; these notes only prioritize shots and never replace source facts."
  ].join("\n\n");
}

export function validatePreprocessedTarget(
  value: string,
  paragraphs: PreparedParagraph[],
  config: Config
): PreprocessedSelection | null {
  const summary = cleanString(value);
  if (!summary) return null;
  const lines = summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const minimum = Math.min(config.minImages, paragraphs.length);
  const maximum = Math.min(config.maxImages, paragraphs.length);
  const paragraphLines = lines;
  if (paragraphLines.length < minimum || paragraphLines.length > maximum) return null;

  const validParagraphs = new Set(paragraphs.map((paragraph) => paragraph.parserIndex));
  const selectedParagraphs: number[] = [];
  const cameraNotes: string[] = [];
  const seen = new Set<number>();
  for (const line of paragraphLines) {
    const match = line.match(/^\[P(\d+)\]\s*:\s*(.+)$/i);
    if (!match) return null;
    const paragraph = Number(match[1]);
    if (!validParagraphs.has(paragraph) || seen.has(paragraph)) return null;
    const thesis = match[2].match(/\bVisual thesis\s*:\s*(.+?)(?=;\s*Camera intent\s*:)/i)?.[1]?.trim() || "";
    const camera = match[2].match(/\bCamera intent\s*:\s*(\S.*)$/i)?.[1]?.trim() || "";
    if (!thesis || !camera) return null;
    seen.add(paragraph);
    selectedParagraphs.push(paragraph);
    cameraNotes.push(camera);
  }
  return { summary: compactBlock(summary, 12000), selectedParagraphs, cameraNotes };
}

export async function preprocessTargetParagraphs(
  parserConnection: ParserConnection,
  config: Config,
  paragraphs: PreparedParagraph[],
  context: ParserContext,
  userId?: string,
  signal?: AbortSignal
): Promise<string> {
  const rawTarget = formatTargetParagraphs(paragraphs);
  if (!config.preprocessingEnabled) return rawTarget;
  try {
    const summary = await generateParserText(parserConnection, config, parserMessages(
      preprocessingInstruction(paragraphs, config),
      continuityReference(context.preprocessingSystemContext ?? context.systemContext, context.recentContext),
      preprocessingUserRequest(rawTarget),
      context.override,
      "auxiliary"
    ), userId, "preprocess", signal);
    const selection = validatePreprocessedTarget(summary, paragraphs, config);
    if (selection) {
      logStage(config, "preprocessing_done", {
        summaryLength: selection.summary.length,
        candidateCount: paragraphs.length,
        selectedCount: selection.selectedParagraphs.length,
        selectedParagraphs: selection.selectedParagraphs,
        cameraNotes: selection.cameraNotes
      });
      return routedTargetSource(rawTarget, selection);
    }
    logStage(config, "preprocessing_fallback", { reason: "invalid_selection", summaryLength: cleanString(summary).length }, "warn");
  } catch (error) {
    throwIfAborted(signal);
    logStage(config, "preprocessing_fallback", { reason: error instanceof Error ? error.message : String(error) }, "warn");
  }
  return rawTarget;
}

function terminalParagraphNumber(value: unknown): number | null {
  const match = String(value ?? "").match(/\d+/);
  if (!match) return null;
  const paragraph = Number(match[0]);
  return Number.isSafeInteger(paragraph) && paragraph > 0 ? paragraph : null;
}

function terminalStateIssues(
  payload: ParsedPayload,
  config: Config,
  currentParagraphs: number[],
  required: boolean
): string[] {
  if (!required) return [];
  const terminal = asRecord(payload.terminalState);
  if (Object.keys(terminal).length === 0) return ["terminalState is missing or is not an object"];
  const finalParagraph = currentParagraphs.at(-1);
  if (finalParagraph && terminalParagraphNumber(terminal.paragraph) !== finalParagraph) {
    return [`terminalState.paragraph must reference final source paragraph P${finalParagraph}`];
  }
  const issues: string[] = [];
  if (!Array.isArray(terminal.characters)) issues.push("terminalState.characters must be an array");
  if (config.promptStyle === "anima") {
    if (!terminal.environment || typeof terminal.environment !== "object" || Array.isArray(terminal.environment)) {
      issues.push("terminalState.environment must remain an object");
    }
  } else if (!Object.prototype.hasOwnProperty.call(terminal, "place")) {
    issues.push("terminalState.place is required for Default prompt style");
  }
  return issues;
}

function terminalStateRepairInstruction(issues: string[], config: Config, currentParagraphs: number[]): string {
  const finalParagraph = currentParagraphs.at(-1);
  return [
    "Repair or add only the non-rendered terminalState object while preserving every existing scene and shot exactly. Return the complete JSON object and no other text.",
    finalParagraph
      ? `Set terminalState.paragraph to P${finalParagraph}, the final original numbered paragraph.`
      : "Use the final original numbered paragraph for terminalState.paragraph.",
    config.promptStyle === "anima"
      ? "terminalState contains paragraph, a complete environment object, environmentChanges, and characters still present after all source paragraphs."
      : "terminalState contains paragraph, place, environmentChanges, and characters still present after all source paragraphs.",
    "Terminal characters contain only name, label, age, appearance, body, attire, attireInferred, and visualChanges. Never add actions, expressions, camera, composition, or rendering fields.",
    "Use the full current source chronology. Later source changes override earlier illustrated scenes.",
    `Problems to repair:\n- ${issues.join("\n- ")}`
  ].join("\n");
}

function payloadRepairInput(
  payload: ParsedPayload,
  messages: ParserGenerationRequest["messages"],
  includeCurrentSource: boolean
): string {
  if (!includeCurrentSource) return JSON.stringify(payload);
  return [
    "## Current Numbered Paragraph Source",
    currentSourceText(messages),
    "## JSON to Repair",
    JSON.stringify(payload)
  ].join("\n\n");
}

export async function parsePayloadWithRepair(
  parserConnection: ParserConnection,
  config: Config,
  messages: ParserGenerationRequest["messages"],
  userId?: string,
  signal?: AbortSignal
): Promise<ParsedPayload> {
  const raw = await generateParserText(parserConnection, config, messages, userId, "main", signal);
  if (!raw.trim()) throw new Error("Parser returned an empty response.");
  const requireDynamicProjection = messages.some((message) =>
    message.role === "system" && message.content.includes("shotPlan.primaryAction")
  );
  const requireTerminalState = messages.some((message) =>
    message.role === "system" && message.content.includes("## Terminal Visual State")
  );
  const currentParagraphs = currentParagraphReferences(messages);
  const routedParagraphs = routedParagraphReferences(messages);
  const allowedParagraphs = routedParagraphs.length > 0 ? routedParagraphs : currentParagraphs;
  const fallbackParagraph = allowedParagraphs.length === 1 ? allowedParagraphs[0] : undefined;
  let repairSystem = "Repair malformed JSON. Return only valid JSON.";
  let repairInput = raw;
  try {
    logStage(config, "json_parse_start", { rawLength: raw.length, repair: false });
    const parsed = normalizeAtomicCompositionTerms(
      dedupeExactShotCharacters(recoverSceneParagraphs(parseParserJson(raw), fallbackParagraph))
    );
    const structuralIssues = structuralPayloadIssues(parsed, allowedParagraphs);
    const terminalIssues = terminalStateIssues(parsed, config, currentParagraphs, requireTerminalState);
    if (structuralIssues.length > 0) {
      repairSystem = [
        structuralRepairInstruction(structuralIssues, allowedParagraphs),
        ...(terminalIssues.length > 0
          ? [terminalStateRepairInstruction(terminalIssues, config, currentParagraphs)]
          : [])
      ].join("\n\n");
      repairInput = payloadRepairInput(parsed, messages, terminalIssues.length > 0);
      throw new Error("Parser payload has no usable numbered shots.");
    }
    const issues = modePayloadIssues(parsed, config, requireDynamicProjection);
    if (terminalIssues.length > 0) {
      repairSystem = [
        terminalStateRepairInstruction(terminalIssues, config, currentParagraphs),
        ...(issues.length > 0 ? [modeRepairInstruction(parsed, config, issues, requireDynamicProjection)] : [])
      ].join("\n\n");
      repairInput = payloadRepairInput(parsed, messages, true);
      throw new Error("Terminal visual state is incomplete.");
    }
    if (issues.length > 0) {
      repairSystem = modeRepairInstruction(parsed, config, issues, requireDynamicProjection);
      repairInput = JSON.stringify(parsed);
      throw new Error("Mode-specific payload is incomplete.");
    }
    logStage(config, "json_parse_done", { repair: false });
    return parsed;
  } catch {
    logStage(config, "json_parse_failed", { rawLength: raw.length, repairWillRun: true }, "warn");
    const repaired = await generateParserText(parserConnection, config, [
      { role: "system", content: repairSystem },
      { role: "user", content: repairInput }
    ], userId, "repair", signal);
    if (!repaired.trim()) throw new Error("Parser returned an empty repair response.");
    const parsed = normalizeAtomicCompositionTerms(
      dedupeExactShotCharacters(recoverSceneParagraphs(parseParserJson(repaired), fallbackParagraph))
    );
    const structuralIssues = structuralPayloadIssues(parsed, allowedParagraphs);
    if (structuralIssues.length > 0) {
      throw new Error(`Parser did not return usable numbered scenes: ${structuralIssues.join("; ")}`);
    }
    const remainingIssues = modePayloadIssues(parsed, config, requireDynamicProjection);
    const remainingTerminalIssues = terminalStateIssues(parsed, config, currentParagraphs, requireTerminalState);
    if (remainingIssues.length > 0 || remainingTerminalIssues.length > 0) {
      throw new Error(`Parser did not return a complete payload: ${[...remainingIssues, ...remainingTerminalIssues].join("; ")}`);
    }
    logStage(config, "json_parse_done", { repair: true });
    return parsed;
  }
}

export async function repairDynamicCameraDiversity(
  parserConnection: ParserConnection,
  config: Config,
  payload: ParsedPayload,
  targetSource: string,
  userId?: string,
  signal?: AbortSignal
): Promise<ParsedPayload> {
  const audit = auditDynamicCameraDiversity(payload, config);
  logStage(config, "camera_diversity_audit", audit);
  if (audit.exactCollisions.length === 0) return payload;
  const hasProjectedDynamicShot = normalizeScenePayload(payload).some(({ shot }) => {
    const perspective = config.adaptiveMode
      ? cleanString(shot.perspectiveMode).toLowerCase()
      : config.perspectiveMode;
    return perspective === "dynamic" && Boolean(cleanString(asRecord(shot.shotPlan).primaryAction));
  });
  if (hasProjectedDynamicShot) {
    logStage(config, "camera_diversity_soft_collision_preserved", {
      reason: "camera and crop-visible projection must remain aligned",
      signatures: audit.signatures,
      exactCollisions: audit.exactCollisions
    });
    return payload;
  }
  const local = repairDynamicCameraDiversityLocally(payload, config, audit);
  if (local) {
    logStage(config, "camera_diversity_repaired", {
      method: "local",
      before: audit.signatures,
      after: auditDynamicCameraDiversity(local, config).signatures,
      remainingExactCollisions: 0
    });
    return local;
  }
  try {
    const raw = await generateParserText(parserConnection, config, [
      { role: "system", content: cameraRepairInstruction(audit) },
      {
        role: "user",
        content: [
          "## Current Numbered Paragraph Source",
          targetSource,
          "## Valid Illustration JSON",
          JSON.stringify(payload)
        ].join("\n\n")
      }
    ], userId, "camera", signal);
    if (!raw.trim()) throw new Error("empty camera repair response");
    const repaired = parseParserJson(raw);
    const merged = mergeDynamicCameraRepair(payload, repaired, config, audit);
    if (!merged) throw new Error("camera repair did not safely reduce exact collisions");
    const repairedAudit = auditDynamicCameraDiversity(merged, config);
    logStage(config, "camera_diversity_repaired", {
      before: audit.signatures,
      after: repairedAudit.signatures,
      remainingExactCollisions: repairedAudit.exactCollisions.length,
      pairRepetitions: repairedAudit.pairRepetitions
    });
    return merged;
  } catch (error) {
    throwIfAborted(signal);
    logStage(config, "camera_diversity_repair_fallback", {
      reason: error instanceof Error ? error.message : String(error),
      preservedSignatures: audit.signatures
    }, "warn");
    return payload;
  }
}
