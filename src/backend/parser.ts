import type { Config } from "../shared/config.js";
import {
  creativeIdeationInstruction,
  creativeIdeationRequest,
  parseCreativeConcepts
} from "./creative.js";
import { parserInstruction } from "./instructions.js";
import { logStage } from "./logging.js";
import { normalizeScenePayload, recoverSceneParagraphs } from "./scenes.js";
import type { CreativeConcept, ParsedPayload, ParserConnection, ParserContext, ParserGenerationRequest, PreparedParagraph, SceneJson, ShotJson } from "./types.js";
import { asRecord, cleanString, compactBlock, keysOf } from "./utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

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
    "Use this reference only to fill missing stable appearance, attire, location, and persistent-action details.",
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
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
    const value = Number(usage[key]);
    if (Number.isFinite(value)) output[key] = value;
  }
  return output;
}

const FUZZY_KEYS = [
  "scenes", "place", "shots", "paragraph", "camera", "situation", "characters", "label", "age", "identity", "appearance", "body", "attire",
  "expression", "action", "composition", "sharedComposition", "environment", "location", "timeWeather", "lightingMood", "backgroundElements",
  "framing", "angle", "perspective", "focus", "position", "pose", "actions", "gaze", "interaction", "spatialRelation",
  "negative", "name", "scene", "positive", "quote", "supplement", "perspectiveMode", "renderScope", "visibleTags"
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

function parseJson(text: string): ParsedPayload {
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

function currentParagraphReferences(messages: ParserGenerationRequest["messages"]): number[] {
  const request = messages.find((message) => message.role === "user" && message.content.includes("## Current Numbered Paragraph Source"));
  if (!request) return [];
  const source = request.content
    .split("## Current Numbered Paragraph Source", 2)[1]
    ?.split("## Selected Creative Concepts", 1)[0] || "";
  return [...new Set([...source.matchAll(/\[P(\d+)\]/gi)].map((match) => Number(match[1])).filter(Number.isFinite))];
}

function structuralPayloadIssues(payload: ParsedPayload, allowedParagraphs: number[]): string[] {
  const normalized = normalizeScenePayload(payload);
  if (normalized.length === 0) return ["no scene contains a shot with a usable paragraph reference"];
  if (allowedParagraphs.length > 0 && !normalized.some((entry) => allowedParagraphs.includes(entry.parserParagraph))) {
    return [`no shot references an allowed paragraph (${allowedParagraphs.map((paragraph) => `P${paragraph}`).join(", ")})`];
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
  const connection = await spindle.connections.get(config.parserConnectionId, userId);
  if (!connection) throw new Error("Parser connection not found.");
  logStage(config, "parser_connection_resolved", {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    connectionModel: connection.model,
    effectiveModel: config.parserModel || connection.model
  });
  return { id: connection.id, name: connection.name, provider: connection.provider, model: connection.model };
}

async function generateParserText(
  connection: ParserConnection,
  config: Config,
  messages: ParserGenerationRequest["messages"],
  userId?: string
): Promise<string> {
  try {
    logStage(config, "parser_llm_start", {
      provider: connection.provider,
      model: config.parserModel || connection.model,
      connectionId: connection.id,
      parameterKeys: keysOf(config.parserParameters),
      messageCount: messages.length,
      messageLengths: messages.map((message) => message.content.length)
    });
    const result = await spindle.generate.raw({
      type: "raw",
      provider: connection.provider,
      model: config.parserModel || connection.model,
      connection_id: connection.id,
      messages,
      parameters: config.parserParameters,
      reasoning: { source: "off" },
      userId
    } as ParserGenerationRequest);
    const text = extractText(result);
    const usage = extractUsage(result);
    logStage(config, "parser_llm_done", { outputLength: text.length, ...(Object.keys(usage).length ? { usage } : {}) });
    return text;
  } catch (error) {
    logStage(config, "parser_llm_error", { error: error instanceof Error ? error.message : String(error) }, "error");
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
  userId?: string
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
      context.override
    ), userId);
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
  override: string
): ParserGenerationRequest["messages"] {
  const messages: ParserGenerationRequest["messages"] = [{ role: "system", content: stableInstruction.trim() }];
  if (referenceContext.trim()) messages.push({ role: "system", content: referenceContext.trim() });
  messages.push({ role: "user", content: userRequest.trim() });
  if (override.trim()) messages.push({
    role: "user",
    content: [
      "Final user instructions override lower-priority parser guidance when they do not conflict with valid JSON output.",
      override.trim()
    ].join("\n\n")
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
      : config.perspectiveMode === "static"
        ? "Favor stable clearly readable beats with conventional framing, limited motion, and limited occlusion."
        : "Favor significant visible action, movement, interaction, and cinematic changes.";
  return [
    "# Illustration Visual-Beat Editor",
    "Select and summarize the strongest visual beats from the current numbered assistant paragraphs.",
    `Select between ${minimum} and ${maximum} unique paragraphs.`,
    "Choose paragraphs with the most significant visual changes, actions, interactions, location changes, or emotional beats across the whole source. Do not favor early paragraphs by default.",
    perspectiveGuidance,
    "Output plain text only. The first line must have exactly this form:",
    "[Appearance: character name1: current visual baseline tags, character name2: current visual baseline tags]",
    "Then output one line per selected paragraph in exactly this form:",
    "[P#]: Visual beat: concise visible details; Camera/composition: concrete angle, framing, depth, or foreground-occlusion note",
    "Use each selected [P#] once. Do not invent or alter paragraph numbers.",
    "Every selected line must include a non-empty Camera/composition note.",
    "Use only visual details and concise English tags or short tag-like phrases. Output no markdown, greeting, or explanation."
  ].join("\n\n");
}

export function preprocessingUserRequest(rawTarget: string): string {
  return ["Edit these current numbered paragraphs into the requested visual-beat selection:", rawTarget].join("\n\n");
}

export type PreprocessedSelection = { summary: string; selectedParagraphs: number[]; cameraNotes: string[] };

export function validatePreprocessedTarget(
  value: string,
  paragraphs: PreparedParagraph[],
  config: Config
): PreprocessedSelection | null {
  const summary = cleanString(value);
  if (!summary) return null;
  const lines = summary.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!/^\[Appearance:[^\]\r\n]*\]$/i.test(lines[0] || "")) return null;
  const minimum = Math.min(config.minImages, paragraphs.length);
  const maximum = Math.min(config.maxImages, paragraphs.length);
  const paragraphLines = lines.slice(1);
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
    const camera = match[2].match(/\bCamera\/composition\s*:\s*(\S.*)$/i)?.[1]?.trim() || "";
    if (!camera) return null;
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
  userId?: string
): Promise<string> {
  const rawTarget = formatTargetParagraphs(paragraphs);
  if (!config.preprocessingEnabled) return rawTarget;
  try {
    const summary = await generateParserText(parserConnection, config, parserMessages(
      preprocessingInstruction(paragraphs, config),
      continuityReference(context.preprocessingSystemContext ?? context.systemContext, context.recentContext),
      preprocessingUserRequest(rawTarget),
      context.override
    ), userId);
    const selection = validatePreprocessedTarget(summary, paragraphs, config);
    if (selection) {
      logStage(config, "preprocessing_done", {
        summaryLength: selection.summary.length,
        candidateCount: paragraphs.length,
        selectedCount: selection.selectedParagraphs.length,
        selectedParagraphs: selection.selectedParagraphs,
        cameraNotes: selection.cameraNotes
      });
      return selection.summary;
    }
    logStage(config, "preprocessing_fallback", { reason: "invalid_selection", summaryLength: cleanString(summary).length }, "warn");
  } catch (error) {
    logStage(config, "preprocessing_fallback", { reason: error instanceof Error ? error.message : String(error) }, "warn");
  }
  return rawTarget;
}

export async function parsePayloadWithRepair(
  parserConnection: ParserConnection,
  config: Config,
  messages: ParserGenerationRequest["messages"],
  userId?: string
): Promise<ParsedPayload> {
  const raw = await generateParserText(parserConnection, config, messages, userId);
  if (!raw.trim()) throw new Error("Parser returned an empty response.");
  const allowedParagraphs = currentParagraphReferences(messages);
  const fallbackParagraph = allowedParagraphs.length === 1 ? allowedParagraphs[0] : undefined;
  let repairSystem = "Repair malformed JSON. Return only valid JSON.";
  let repairInput = raw;
  try {
    logStage(config, "json_parse_start", { rawLength: raw.length, repair: false });
    const parsed = recoverSceneParagraphs(parseJson(raw), fallbackParagraph);
    const structuralIssues = structuralPayloadIssues(parsed, allowedParagraphs);
    if (structuralIssues.length > 0) {
      repairSystem = structuralRepairInstruction(structuralIssues, allowedParagraphs);
      throw new Error("Parser payload has no usable numbered shots.");
    }
    const issues = staticPayloadIssues(parsed, config);
    if (issues.length > 0) {
      repairSystem = staticRepairInstruction(issues);
      repairInput = JSON.stringify(parsed);
      throw new Error("Static payload is incomplete.");
    }
    logStage(config, "json_parse_done", { repair: false });
    return parsed;
  } catch {
    logStage(config, "json_parse_failed", { rawLength: raw.length, repairWillRun: true }, "warn");
    const repaired = await generateParserText(parserConnection, config, [
      { role: "system", content: repairSystem },
      { role: "user", content: repairInput }
    ], userId);
    if (!repaired.trim()) throw new Error("Parser returned an empty repair response.");
    const parsed = recoverSceneParagraphs(parseJson(repaired), fallbackParagraph);
    const structuralIssues = structuralPayloadIssues(parsed, allowedParagraphs);
    if (structuralIssues.length > 0) {
      throw new Error(`Parser did not return usable numbered scenes: ${structuralIssues.join("; ")}`);
    }
    const remainingIssues = staticPayloadIssues(parsed, config);
    if (remainingIssues.length > 0) {
      throw new Error(`Parser did not return a complete Static scene: ${remainingIssues.join("; ")}`);
    }
    logStage(config, "json_parse_done", { repair: true });
    return parsed;
  }
}
