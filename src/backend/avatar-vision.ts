import type { Config } from "../shared/config.js";
import { requestAvatarImage } from "./avatar-image-bridge.js";
import { logStage } from "./logging.js";
import { sanitizeMemoryTags } from "./memory.js";
import { normalizeCharacterName } from "./prompt.js";
import { normalizeScenePayload } from "./scenes.js";
import { updateState } from "./storage.js";
import type {
  AvatarVisualSupplement,
  AvatarVisionAttempt,
  CharacterJson,
  ParsedPayload,
  ParserConnection,
  State
} from "./types.js";
import { asRecord, cleanArray, cleanString, csvParts, unique } from "./utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

const MAX_CARD_CONTEXT = 7_000;
const MAX_SUPPLEMENT_FIELD = 700;
const GENERIC_TAGS = new Set(["girl", "boy", "woman", "man", "1girl", "1boy", "solo", "character"]);

export function avatarSupplementKey(characterId: string): string {
  return characterId.trim();
}

export function avatarVisionAttemptKey(
  characterId: string,
  imageId: string,
  provider: string,
  model: string
): string {
  return JSON.stringify([characterId, imageId, provider, model]);
}

function explicitBoolean(root: unknown, keys: string[]): boolean | null {
  const record = asRecord(root);
  for (const key of keys) {
    if (typeof record[key] === "boolean") return record[key] as boolean;
  }
  return null;
}

/** Returns false only when connection metadata explicitly declares text-only input. */
export function declaredVisionSupport(metadata: unknown): boolean | null {
  const record = asRecord(metadata);
  const direct = explicitBoolean(record, ["vision", "supportsVision", "supports_vision", "multimodal", "supportsImages", "supports_images"]);
  if (direct !== null) return direct;
  const capabilities = asRecord(record.capabilities);
  const nested = explicitBoolean(capabilities, ["vision", "image", "images", "multimodal"]);
  if (nested !== null) return nested;
  const modalities = [record.input_modalities, record.inputModalities, capabilities.input_modalities, capabilities.inputModalities]
    .flatMap((value) => cleanArray<unknown>(value).map((item) => cleanString(item).toLowerCase()));
  if (modalities.includes("image") || modalities.includes("vision")) return true;
  if (modalities.length > 0 && modalities.every((value) => value === "text")) return false;
  return null;
}

export function unsupportedVisionError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return /(?:image|vision|multimodal).*(?:unsupported|not supported|not allowed|invalid)|(?:unsupported|invalid|does not support|doesn't support).*(?:image|vision|content.*array|input modality)|text[- ]only/.test(message);
}

function textParts(value: unknown): string {
  if (typeof value === "string") return value;
  return cleanArray<unknown>(value).map((part) => cleanString(asRecord(part).text || asRecord(part).content)).filter(Boolean).join("\n");
}

function resultText(result: unknown): string {
  if (typeof result === "string") return result;
  const root = asRecord(result);
  for (const key of ["content", "text", "output", "message"]) {
    const text = textParts(root[key]);
    if (text) return text;
  }
  const choice = asRecord(cleanArray<unknown>(root.choices)[0]);
  return textParts(asRecord(choice.message).content);
}

function jsonObject(text: string): Record<string, unknown> {
  const stripped = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  try {
    return asRecord(JSON.parse(stripped));
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Avatar vision returned no JSON object.");
    return asRecord(JSON.parse(stripped.slice(start, end + 1)));
  }
}

function sanitizeVisionTags(value: unknown): string {
  const clean = sanitizeMemoryTags(cleanString(value));
  return unique(csvParts(clean).filter((tag) => {
    const normalized = tag.toLowerCase();
    if (GENERIC_TAGS.has(normalized)) return false;
    return !/\b(?:smil(?:e|es|ing)|grin(?:s|ning)?|frown(?:s|ing)?|crying|blushing|standing|sitting|posing|looking at viewer)\b/.test(normalized);
  }))
    .join(", ")
    .slice(0, MAX_SUPPLEMENT_FIELD)
    .replace(/,\s*$/, "");
}

export function parseAvatarVisualSupplement(
  raw: string,
  identity: { characterId: string; imageId: string; characterName: string; provider: string; model: string },
  createdAt = new Date().toISOString()
): AvatarVisualSupplement {
  const parsed = jsonObject(raw);
  return {
    ...identity,
    appearance: sanitizeVisionTags(parsed.appearance),
    body: sanitizeVisionTags(parsed.body),
    attire: sanitizeVisionTags(parsed.attire),
    createdAt
  };
}

function cardContext(character: Record<string, unknown>, canonicalTags: string): string {
  const rows = [
    `Name: ${cleanString(character.name)}`,
    cleanString(character.description) ? `Description: ${cleanString(character.description)}` : "",
    cleanString(character.personality) ? `Personality: ${cleanString(character.personality)}` : "",
    cleanString(character.scenario) ? `Scenario: ${cleanString(character.scenario)}` : "",
    Array.isArray(character.tags) && character.tags.length ? `Card tags: ${character.tags.map(cleanString).filter(Boolean).join(", ")}` : "",
    canonicalTags ? `Existing canonical visual tags: ${canonicalTags}` : ""
  ].filter(Boolean).join("\n");
  return rows.slice(0, MAX_CARD_CONTEXT);
}

function visionInstruction(characterName: string, context: string): string {
  return [
    "Inspect the supplied character profile picture against the supplied character-card text.",
    "The text is authoritative. Return only directly visible, stable visual details that complement details missing from the text and existing canonical tags.",
    "Never contradict or repeat an explicitly stated text attribute. Do not infer hidden anatomy, personality, ethnicity, age, or conventional species traits.",
    "Prioritize missing colors and stable shapes for hair, eyes, skin or fur, markings, species features, recurring accessories, and visible default clothing.",
    "Ignore expression, pose, gesture, camera, crop, background, lighting, art style, image quality, and temporary effects.",
    "For attire, if the card names a garment, add only missing visible properties of that garment; do not replace it with an unrelated portrait outfit. Add a new default garment only when the text establishes no attire.",
    "Use short comma-separated image-generation tags. If no safe complement exists for a field, return an empty string.",
    'Return exactly one JSON object: {"appearance":"...","body":"...","attire":"..."}.',
    `Character: ${characterName}`,
    "## Character Card",
    context
  ].join("\n\n");
}

async function analyzeAvatar(
  character: Record<string, unknown>,
  canonicalTags: string,
  connection: ParserConnection,
  config: Config,
  chatId: string,
  userId?: string,
  signal?: AbortSignal
): Promise<AvatarVisualSupplement> {
  const characterId = cleanString(character.id);
  const imageId = cleanString(character.image_id);
  const characterName = cleanString(character.name);
  const model = config.parserModel || connection.model;
  const avatar = await requestAvatarImage(imageId, chatId, userId, signal);
  const parameters: Record<string, unknown> = { ...config.parserParameters };
  if (parameters.max_tokens === undefined && parameters.max_completion_tokens === undefined) parameters.max_tokens = 1000;
  if (parameters.temperature === undefined) parameters.temperature = 0;
  const result = await spindle.generate.raw({
    type: "raw",
    provider: connection.provider,
    model,
    connection_id: connection.id,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: visionInstruction(characterName, cardContext(character, canonicalTags)) },
        { type: "image", data: avatar.data, mime_type: avatar.mimeType }
      ]
    }],
    parameters,
    reasoning: { source: "off" },
    userId,
    signal
  } as Parameters<typeof spindle.generate.raw>[0] & { provider: string; model: string });
  const raw = resultText(result);
  if (!raw) throw new Error("Avatar vision returned no output.");
  return parseAvatarVisualSupplement(raw, {
    characterId,
    imageId,
    characterName,
    provider: connection.provider,
    model
  });
}

function applyLocalAttempt(state: State, key: string, attempt: AvatarVisionAttempt, supplement?: AvatarVisualSupplement): void {
  state.avatarVisionAttempts ||= {};
  state.avatarVisionAttempts[key] = attempt;
  const supplementKey = avatarSupplementKey(attempt.characterId);
  const stale = state.avatarVisualSupplements?.[supplementKey];
  if (stale && stale.imageId !== attempt.imageId) delete state.avatarVisualSupplements?.[supplementKey];
  if (supplement) {
    state.avatarVisualSupplements ||= {};
    state.avatarVisualSupplements[supplementKey] = supplement;
  }
}

async function persistAttempt(
  chatId: string,
  key: string,
  attempt: AvatarVisionAttempt,
  supplement: AvatarVisualSupplement | undefined,
  userId?: string
): Promise<void> {
  await updateState(chatId, userId, (current) => applyLocalAttempt(current, key, attempt, supplement));
}

/** Performs at most one avatar-vision attempt for a character/avatar/parser tuple. Failures never block normal generation. */
export async function ensureAvatarVisualSupplement(input: {
  chatId: string;
  character: Record<string, unknown> | null;
  canonicalTags: Record<string, string>;
  connection: ParserConnection;
  config: Config;
  state: State;
  userId?: string;
  signal?: AbortSignal;
}): Promise<AvatarVisualSupplement | null> {
  const character = input.character;
  if (!character) return null;
  const characterId = cleanString(character.id);
  const imageId = cleanString(character.image_id);
  const characterName = cleanString(character.name);
  if (!characterId || !imageId || !characterName) return null;
  const supplementKey = avatarSupplementKey(characterId);
  const existing = input.state.avatarVisualSupplements?.[supplementKey];
  if (existing?.imageId === imageId) return existing;

  const model = input.config.parserModel || input.connection.model;
  const attemptKey = avatarVisionAttemptKey(characterId, imageId, input.connection.provider, model);
  const previousAttempt = input.state.avatarVisionAttempts?.[attemptKey];
  if (previousAttempt) {
    applyLocalAttempt(input.state, attemptKey, previousAttempt);
    try { await persistAttempt(input.chatId, attemptKey, previousAttempt, undefined, input.userId); } catch { /* non-fatal cache write */ }
    return null;
  }
  if (declaredVisionSupport(input.connection.metadata) === false) {
    const attempt: AvatarVisionAttempt = {
      characterId, imageId, provider: input.connection.provider, model,
      status: "unsupported", attemptedAt: new Date().toISOString()
    };
    applyLocalAttempt(input.state, attemptKey, attempt);
    try { await persistAttempt(input.chatId, attemptKey, attempt, undefined, input.userId); } catch { /* non-fatal cache write */ }
    return null;
  }

  const canonicalKey = Object.keys(input.canonicalTags)
    .find((name) => normalizeCharacterName(name).toLowerCase() === normalizeCharacterName(characterName).toLowerCase());
  const canonicalTags = canonicalKey ? input.canonicalTags[canonicalKey] : "";
  try {
    logStage(input.config, "avatar_vision_start", { characterId, imageId, provider: input.connection.provider, model });
    const supplement = await analyzeAvatar(
      character,
      canonicalTags,
      input.connection,
      input.config,
      input.chatId,
      input.userId,
      input.signal
    );
    const attempt: AvatarVisionAttempt = {
      characterId, imageId, provider: input.connection.provider, model,
      status: "completed", attemptedAt: supplement.createdAt
    };
    applyLocalAttempt(input.state, attemptKey, attempt, supplement);
    try { await persistAttempt(input.chatId, attemptKey, attempt, supplement, input.userId); } catch { /* non-fatal cache write */ }
    logStage(input.config, "avatar_vision_done", {
      characterId,
      appearanceTags: csvParts(supplement.appearance).length,
      bodyTags: csvParts(supplement.body).length,
      attireTags: csvParts(supplement.attire).length
    });
    return supplement;
  } catch (error) {
    if (input.signal?.aborted) throw error;
    const status = unsupportedVisionError(error) ? "unsupported" : "failed";
    const attempt: AvatarVisionAttempt = {
      characterId, imageId, provider: input.connection.provider, model,
      status, attemptedAt: new Date().toISOString()
    };
    applyLocalAttempt(input.state, attemptKey, attempt);
    try { await persistAttempt(input.chatId, attemptKey, attempt, undefined, input.userId); } catch { /* non-fatal cache write */ }
    logStage(input.config, "avatar_vision_skipped", {
      characterId,
      status,
      error: error instanceof Error ? error.message : String(error)
    }, "warn");
    return null;
  }
}

function changed(character: CharacterJson, field: "appearance" | "body" | "attire"): boolean {
  const changes = cleanArray<unknown>(character.visualChanges).map((value) => cleanString(value).toLowerCase());
  return changes.includes(field) || character.sources?.[field] === "narrative_explicit";
}

/** Adds cached avatar observations as render-only fields; canonical memory ignores these properties. */
export function applyAvatarVisualSupplements(
  payload: ParsedPayload,
  supplements: Record<string, AvatarVisualSupplement> | undefined
): ParsedPayload {
  const profiles = Object.values(supplements || {});
  if (profiles.length === 0) return payload;
  for (const { shot } of normalizeScenePayload(payload)) {
    for (const character of cleanArray<CharacterJson>(shot.characters)) {
      const name = normalizeCharacterName(cleanString(character.name)).toLowerCase();
      const profile = profiles.find((candidate) => normalizeCharacterName(candidate.characterName).toLowerCase() === name);
      if (!profile) continue;
      if (!changed(character, "appearance")) character.avatarAppearance = profile.appearance;
      if (!changed(character, "body")) character.avatarBody = profile.body;
      // Avatar attire complements only empty or card-sourced attire; rolling
      // (previous-memory), narrative, and scene-inferred outfits always win.
      const attireSource = character.sources?.attire;
      const attireWins = cleanString(character.attire) && attireSource !== "card_explicit";
      if (!changed(character, "attire") && !attireWins) character.avatarAttire = profile.attire;
    }
  }
  return payload;
}
