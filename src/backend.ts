declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

const EXTENSION_ID = "inlay_illustrator";
const MARKER = "<!-- inlay_illustrator -->";

type PromptPreset = {
  id: string;
  name: string;
  positivePrefix: string;
  negativePrefix: string;
};

type Config = {
  enabled: boolean;
  autoGenerate: boolean;
  debugLogging: boolean;
  mode: "illustration" | "asset";
  parserConnectionId: string | null;
  parserModel: string;
  parserParameters: Record<string, unknown>;
  imageConnectionId: string | null;
  imageModel: string;
  imageParameters: Record<string, unknown>;
  minImages: number;
  maxImages: number;
  maxCharacters: number;
  includeMinMessages: number;
  includeMaxMessages: number;
  parserRetries: number;
  preprocessingEnabled: boolean;
  inlayImageWidth: number;
  assetImageWidth: number;
  inlayImageMaxHeightVh: number;
  promptStyle: "default" | "anima";
  promptSyntax: "nai" | "comfyui";
  includeUserInfo: boolean;
  includeCharacterInfo: boolean;
  includeLorebook: boolean;
  characterTagContextEnabled: boolean;
  userInstructionsEnabled: boolean;
  customParserInstructions: string;
  originalReference: boolean;
  originalCreationName: string;
  supplement: boolean;
  danbooruCleanup: boolean;
  danbooruEndpoint: string;
  ignoredTags: string;
  customPositivePrefix: string;
  customPositiveSuffix: string;
  customNegative: string;
  promptPresets: PromptPreset[];
  activePromptPresetId: string | null;
};

type CharacterJson = {
  name?: unknown;
  label?: unknown;
  age?: unknown;
  identity?: unknown;
  appearance?: unknown;
  body?: unknown;
  attire?: unknown;
  expression?: unknown;
  action?: unknown;
};

type ShotJson = {
  paragraph?: unknown;
  camera?: unknown;
  situation?: unknown;
  action?: unknown;
  characters?: CharacterJson[];
  supplement?: unknown;
  negative?: unknown;
};

type SceneJson = ShotJson & { place?: unknown; shots?: ShotJson[] };
type ParsedPayload = { scenes?: SceneJson[] };
type AssembledPrompt = {
  /** Tag-only sections, kept separate so tag cleanup never sees prose. */
  tagSections: string[];
  /** Natural-language prose appended at its original point in the prompt. */
  supplement: string;
  /** Number of tag sections that occur before the supplement. */
  supplementAfterTagSections: number;
};
type PromptEntry = { prompt: AssembledPrompt; negative: string; paragraph: number; parserParagraph: number };
type PreparedParagraph = { parserIndex: number; originalIndex: number; text: string };
type NormalizedScene = { scene: SceneJson; shot: ShotJson; parserParagraph: number };
type ChatMessage = {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  swipe_id?: unknown;
};
type ParserContext = {
  systemContext: string;
  recentContext: string;
  override: string;
  diagnostics: Record<string, unknown>;
};
type ParserConnection = {
  id: string;
  name: string;
  provider: string;
  model: string;
};
type ImageConnection = {
  id: string;
  name: string;
  provider: string;
  model: string;
  is_default?: boolean;
  default_parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};
type ComfyUIMapping = {
  nodeId: string;
  fieldName: string;
  mappedAs: string;
};
type ComfyUIConfig = {
  workflow_json?: Record<string, unknown>;
  workflow_api_json?: Record<string, unknown>;
  field_mappings?: ComfyUIMapping[];
};
type PreparedImageJob = {
  index: number;
  total: number;
  prompt: string;
  negative: string;
  paragraph: number;
  parameters: Record<string, unknown>;
};
type State = {
  characterAppearance: Record<string, string>;
  generated: Record<string, unknown>;
};
type RawConfig = Partial<Config> & {
  imageGeneration?: {
    promptParserConnectionId?: string | null;
    promptParserModel?: string;
    promptParserParameters?: Record<string, unknown>;
    activeImageGenConnectionId?: string | null;
    model?: string;
    parameters?: Record<string, unknown>;
  };
};
type ParserGenerationRequest = {
  type: "raw";
  provider: string;
  model: string;
  connection_id: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  parameters?: Record<string, unknown>;
  reasoning: { source: "off" };
  userId?: string;
};
type CorsTextResponse = {
  status?: number;
  statusText?: string;
  body?: unknown;
};
type DanbooruSuggestion = { tag?: string; score?: number };
type DanbooruPayload = {
  valid?: string[];
  suggestions?: Record<string, DanbooruSuggestion[]>;
  data?: {
    valid?: string[];
    suggestions?: Record<string, DanbooruSuggestion[]>;
  };
};

const DANBOORU_CLEANUP_BATCH_SIZE = 16;

const DEFAULT_CONFIG: Config = {
  enabled: true,
  autoGenerate: true,
  debugLogging: true,
  mode: "illustration",
  parserConnectionId: null,
  parserModel: "",
  parserParameters: {},
  imageConnectionId: null,
  imageModel: "",
  imageParameters: {},
  minImages: 1,
  maxImages: 3,
  maxCharacters: 2,
  includeMinMessages: 0,
  includeMaxMessages: 8,
  parserRetries: 1,
  preprocessingEnabled: false,
  inlayImageWidth: 640,
  assetImageWidth: 400,
  inlayImageMaxHeightVh: 70,
  promptStyle: "anima",
  promptSyntax: "comfyui",
  includeUserInfo: true,
  includeCharacterInfo: true,
  includeLorebook: false,
  characterTagContextEnabled: true,
  userInstructionsEnabled: true,
  customParserInstructions: "",
  originalReference: false,
  originalCreationName: "",
  supplement: true,
  danbooruCleanup: false,
  danbooruEndpoint: "http://127.0.0.1:8000/tools/validate_tags",
  ignoredTags: "",
  customPositivePrefix: "",
  customPositiveSuffix: "",
  customNegative: "",
  promptPresets: [],
  activePromptPresetId: null
};

const running = new Set<string>();

function logStage(config: Pick<Config, "debugLogging"> | null, stage: string, details?: Record<string, unknown>, level: "info" | "warn" | "error" = "info"): void {
  if (!config?.debugLogging && level !== "error") return;
  const suffix = details ? ` ${JSON.stringify(details, (_key, value) => {
    if (typeof value === "string" && value.length > 300) return `${value.slice(0, 300)}...(${value.length} chars)`;
    return value;
  })}` : "";
  const message = `[Inlay:${stage}]${suffix}`;
  if (level === "warn") spindle.log.warn(message);
  else if (level === "error") spindle.log.error(message);
  else spindle.log.info(message);
}

function keysOf(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value as Record<string, unknown>) : [];
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullableString(value: unknown): string | null {
  const clean = cleanString(value);
  return clean || null;
}

function cleanParameters(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizePromptPresets(value: unknown): PromptPreset[] {
  const seen = new Set<string>();
  const presets: PromptPreset[] = [];
  for (const candidate of cleanArray<Record<string, unknown>>(value)) {
    const id = cleanString(candidate.id);
    const name = cleanString(candidate.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    presets.push({
      id,
      name,
      positivePrefix: cleanString(candidate.positivePrefix),
      negativePrefix: cleanString(candidate.negativePrefix)
    });
  }
  return presets;
}

function parseCorsJson<T>(response: unknown, label: string): T {
  const wrapper = asRecord(response);
  if (wrapper && ("body" in wrapper || "status" in wrapper || "statusText" in wrapper)) {
    const { status, statusText, body } = wrapper as CorsTextResponse;
    if (typeof status === "number" && (status < 200 || status >= 300)) {
      throw new Error(`${label} returned HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
    }
    if (typeof body === "string") {
      try {
        return JSON.parse(body) as T;
      } catch {
        throw new Error(`${label} returned invalid JSON`);
      }
    }
    if (body && typeof body === "object") return body as T;
    throw new Error(`${label} returned an empty response body`);
  }
  return response as T;
}

function normalizeConfig(raw: RawConfig): Config {
  const imageGeneration = raw.imageGeneration || {};
  const includeMin = clampInt(raw.includeMinMessages, 0, 32, DEFAULT_CONFIG.includeMinMessages);
  const includeMax = clampInt(raw.includeMaxMessages, 0, 32, DEFAULT_CONFIG.includeMaxMessages);
  const minImages = clampInt(raw.minImages, 1, 12, DEFAULT_CONFIG.minImages);
  const maxImages = clampInt(raw.maxImages, 1, 12, DEFAULT_CONFIG.maxImages);
  const promptPresets = normalizePromptPresets(raw.promptPresets);
  const activePromptPresetId = cleanNullableString(raw.activePromptPresetId);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    mode: raw.mode === "asset" ? "asset" : "illustration",
    parserConnectionId: cleanNullableString(raw.parserConnectionId) || cleanNullableString(imageGeneration.promptParserConnectionId),
    parserModel: cleanString(raw.parserModel) || cleanString(imageGeneration.promptParserModel),
    parserParameters: Object.keys(cleanParameters(raw.parserParameters)).length > 0 ? cleanParameters(raw.parserParameters) : cleanParameters(imageGeneration.promptParserParameters),
    imageConnectionId: cleanNullableString(raw.imageConnectionId) || cleanNullableString(imageGeneration.activeImageGenConnectionId),
    imageModel: cleanString(raw.imageModel) || cleanString(imageGeneration.model),
    imageParameters: Object.keys(cleanParameters(raw.imageParameters)).length > 0 ? cleanParameters(raw.imageParameters) : cleanParameters(imageGeneration.parameters),
    minImages: Math.min(minImages, maxImages),
    maxImages: Math.max(minImages, maxImages),
    maxCharacters: clampInt(raw.maxCharacters, 1, 8, DEFAULT_CONFIG.maxCharacters),
    includeMinMessages: Math.min(includeMin, includeMax),
    includeMaxMessages: Math.max(includeMin, includeMax),
    parserRetries: clampInt(raw.parserRetries, 0, 5, DEFAULT_CONFIG.parserRetries),
    preprocessingEnabled: raw.preprocessingEnabled === true,
    inlayImageWidth: clampInt(raw.inlayImageWidth, 120, 2400, DEFAULT_CONFIG.inlayImageWidth),
    assetImageWidth: clampInt(raw.assetImageWidth, 120, 2400, DEFAULT_CONFIG.assetImageWidth),
    inlayImageMaxHeightVh: clampInt(raw.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh),
    promptStyle: raw.promptStyle === "default" ? "default" : "anima",
    promptSyntax: raw.promptSyntax === "nai" ? "nai" : "comfyui",
    includeUserInfo: raw.includeUserInfo !== false,
    includeCharacterInfo: raw.includeCharacterInfo !== false,
    includeLorebook: raw.includeLorebook === true,
    characterTagContextEnabled: raw.characterTagContextEnabled !== false,
    userInstructionsEnabled: raw.userInstructionsEnabled !== false,
    customParserInstructions: cleanString(raw.customParserInstructions),
    ignoredTags: cleanString(raw.ignoredTags),
    customPositivePrefix: cleanString(raw.customPositivePrefix),
    customPositiveSuffix: cleanString(raw.customPositiveSuffix),
    customNegative: cleanString(raw.customNegative),
    promptPresets,
    activePromptPresetId: activePromptPresetId && promptPresets.some((preset) => preset.id === activePromptPresetId)
      ? activePromptPresetId
      : null
  };
}

async function readJson<T>(path: string, fallback: T, userId?: string): Promise<T> {
  try {
    if (!(await spindle.userStorage.exists(path, userId))) return fallback;
    const text = await spindle.userStorage.read(path, userId);
    return { ...fallback, ...JSON.parse(text) };
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown, userId?: string): Promise<void> {
  const slash = path.lastIndexOf("/");
  if (slash > 0) await spindle.userStorage.mkdir(path.slice(0, slash), userId).catch(() => undefined);
  await spindle.userStorage.write(path, JSON.stringify(value, null, 2), userId);
}

async function getConfig(userId?: string): Promise<Config> {
  return normalizeConfig(await readJson<RawConfig>("config.json", DEFAULT_CONFIG, userId));
}

async function setConfig(patch: Partial<Config>, userId?: string): Promise<Config> {
  const next = normalizeConfig({ ...(await getConfig(userId)), ...patch });
  await writeJson("config.json", next, userId);
  return next;
}

async function getState(chatId: string, userId?: string): Promise<State> {
  return readJson<State>(`states/${chatId}.json`, { characterAppearance: {}, generated: {} }, userId);
}

async function getParserConnections(userId?: string): Promise<ParserConnection[]> {
  try {
    return (await spindle.connections.list(userId)).map((connection) => ({
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      model: connection.model
    }));
  } catch (err) {
    spindle.log.warn(`Parser connection list unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function sendState(userId?: string, chatId?: string): Promise<void> {
  const state = chatId ? await getState(chatId, userId) : null;
  spindle.sendToFrontend({
    type: "state",
    config: await getConfig(userId),
    parserConnections: await getParserConnections(userId),
    chatId: chatId || "",
    characterAppearance: state?.characterAppearance || {}
  }, userId);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compactBlock(value: string, maxLength: number): string {
  const clean = value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength).trim()}\n...[truncated]` : clean;
}

function namedField(label: string, value: unknown): string {
  const text = cleanString(value);
  return text ? `${label}: ${text}` : "";
}

function formatInfoBlock(title: string, lines: string[], maxLength = 4000): string {
  const clean = lines.map((line) => line.trim()).filter(Boolean);
  return clean.length ? compactBlock([`## ${title}`, ...clean].join("\n"), maxLength) : "";
}

function findNestedString(root: unknown, path: string[]): string {
  let current: unknown = root;
  for (const part of path) current = asRecord(current)[part];
  return cleanString(current);
}

function collectExtraInstructionStrings(root: unknown): string[] {
  const values = [
    findNestedString(root, ["lb-xnai", "lb", "extra"]),
    findNestedString(root, ["lb_xnai", "lb", "extra"]),
    findNestedString(root, ["Inlay", "extra"]),
    findNestedString(root, ["inlay", "extra"])
  ];
  return unique(values.filter(Boolean)).map((value) => compactBlock(value, 2000));
}

function formatRecentContext(messages: ChatMessage[], targetIndex: number, includeCount: number): string {
  if (includeCount <= 0) return "";
  const previous = messages
    .slice(0, Math.max(0, targetIndex))
    .filter((message) => message.role === "assistant" && !isOwnMessage(message))
    .slice(-includeCount);
  return compactBlock(previous.map((message) => `${message.role}: ${message.content}`).join("\n\n"), 8000);
}

function includeCountForAttempt(config: Config, attempt: number): number {
  if (config.includeMaxMessages <= config.includeMinMessages) return config.includeMinMessages;
  if (config.parserRetries <= 0) return config.includeMinMessages;
  const step = Math.ceil((config.includeMaxMessages - config.includeMinMessages) / config.parserRetries);
  return Math.min(config.includeMaxMessages, config.includeMinMessages + step * attempt);
}

async function buildParserContext(
  chatId: string,
  messages: ChatMessage[],
  targetIndex: number,
  cache: Record<string, string>,
  config: Config,
  attempt: number,
  userId?: string
): Promise<ParserContext> {
  const blocks: string[] = [];
  const overrides: string[] = [];
  const diagnostics: Record<string, unknown> = { attempt, includeCount: includeCountForAttempt(config, attempt) };
  let chat: Record<string, unknown> | null = null;

  if (config.includeCharacterInfo || config.includeLorebook || config.userInstructionsEnabled) {
    try {
      chat = await spindle.chats.get(chatId, userId) as unknown as Record<string, unknown> | null;
      overrides.push(...collectExtraInstructionStrings(chat?.metadata));
    } catch (err) {
      diagnostics.chatLookupError = err instanceof Error ? err.message : String(err);
    }
  }

  if (config.includeUserInfo || config.userInstructionsEnabled) {
    try {
      const persona = await spindle.personas.getActive(userId) as unknown;
      const record = asRecord(persona);
      const block = config.includeUserInfo ? formatInfoBlock("{{user}} Info", [
        namedField("Name", record.name),
        namedField("Title", record.title),
        namedField("Description", record.description)
      ]) : "";
      if (block) blocks.push(block);
      overrides.push(...collectExtraInstructionStrings(record.metadata));
      diagnostics.userInfo = Boolean(block);
    } catch (err) {
      diagnostics.userInfoError = err instanceof Error ? err.message : String(err);
    }
  }

  if (config.includeCharacterInfo && chat?.character_id) {
    try {
      const character = await spindle.characters.get(String(chat.character_id), userId) as unknown;
      const record = asRecord(character);
      const block = formatInfoBlock("{{char}} Info", [
        namedField("Name", record.name),
        namedField("Description", record.description),
        namedField("Personality", record.personality),
        namedField("Scenario", record.scenario),
        namedField("Creator notes", record.creator_notes),
        namedField("System prompt", record.system_prompt),
        namedField("Post-history instructions", record.post_history_instructions),
        Array.isArray(record.tags) && record.tags.length ? `Tags: ${record.tags.join(", ")}` : ""
      ], 6000);
      if (block) blocks.push(block);
      overrides.push(...collectExtraInstructionStrings(record.extensions));
      diagnostics.characterInfo = Boolean(block);
    } catch (err) {
      diagnostics.characterInfoError = err instanceof Error ? err.message : String(err);
    }
  }

  if (config.includeLorebook) {
    try {
      const activated = await spindle.world_books.getActivated(chatId, userId) as unknown[];
      const rows: string[] = [];
      for (const entry of activated.slice(0, 24)) {
        const record = asRecord(entry);
        let content = "";
        try {
          const full = await spindle.world_books.entries.get(String(record.id || ""), userId) as unknown;
          content = cleanString(asRecord(full).content);
        } catch {
          content = "";
        }
        const title = cleanString(record.comment) || (Array.isArray(record.keys) ? record.keys.join(", ") : "");
        const summary = content || [title, Array.isArray(record.keys) && record.keys.length ? `Keys: ${record.keys.join(", ")}` : ""].filter(Boolean).join("\n");
        if (summary) rows.push(title ? `### ${title}\n${summary}` : summary);
      }
      const block = rows.length ? compactBlock(["## Lorebook", ...rows].join("\n\n"), 8000) : "";
      if (block) blocks.push(block);
      diagnostics.lorebookEntries = rows.length;
    } catch (err) {
      diagnostics.lorebookError = err instanceof Error ? err.message : String(err);
    }
  }

  if (config.characterTagContextEnabled) {
    const characterReference = buildCharacterTagReference(cache);
    if (characterReference) {
      blocks.push(`${characterReference}\nUse these as a baseline for returning characters (including their base attire). The current message always wins over this reference.`);
    }
    diagnostics.cacheCharacters = Object.keys(cache).length;
  }

  if (config.userInstructionsEnabled) {
    overrides.unshift(config.customParserInstructions);
  }

  return {
    systemContext: blocks.filter(Boolean).join("\n\n"),
    recentContext: formatRecentContext(messages, targetIndex, includeCountForAttempt(config, attempt)),
    override: unique(overrides.map((value) => cleanString(value)).filter(Boolean)).join("\n\n"),
    diagnostics
  };
}

function csvParts(...values: unknown[]): string[] {
  return values.flatMap((v) => String(v || "").split(",")).map((v) => v.trim()).filter(Boolean);
}

function normalizeReferenceTags(tagString: unknown): string {
  return unique(csvParts(tagString).filter((tag) => {
    const normalized = tag.toLowerCase();
    return normalized !== "null" && normalized !== "none";
  })).join(", ");
}

function unique(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(part);
    }
  }
  return out;
}

function stripParenthetical(value: string): string {
  return value.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function displayName(name: string, config: Config): string {
  const clean = stripParenthetical(name);
  const source = config.originalCreationName.trim();
  return config.originalReference && clean && source ? `${clean} \\(${source}\\)` : clean;
}

function normalizeCharacterName(value: unknown): string {
  return stripParenthetical(cleanString(value));
}

function shouldIncludeCharacterNames(config: Config): boolean {
  return config.originalReference === true && config.originalCreationName.trim().length > 0;
}

function characterDescriptor(character: CharacterJson): string {
  const parts = csvParts(character.label, character.age);
  const text = parts.join(" ").toLowerCase();
  if (/\bgirl\b|\bfemale\b|\bwoman\b/.test(text)) return "the girl";
  if (/\bboy\b|\bmale\b|\bman\b/.test(text)) return "the boy";
  if (/\bchild\b/.test(text)) return "the child";
  return "the character";
}

function buildNameReplacementMap(characters: CharacterJson[]): Map<string, string> {
  const replacements = new Map<string, string>();
  for (const character of characters) {
    const descriptor = characterDescriptor(character);
    const raw = cleanString(character.name);
    const normalized = normalizeCharacterName(raw);
    for (const name of unique([raw, normalized].filter(Boolean))) {
      if (name.length >= 2) replacements.set(name, descriptor);
    }
  }
  return replacements;
}

function stripOrReplaceNames(value: string, replacements: Map<string, string>, tagField: boolean): string {
  if (!value || replacements.size === 0) return value;
  if (tagField) {
    return unique(csvParts(value)
      .map((tag) => {
        let next = tag;
        for (const [name, descriptor] of replacements) {
          const tagName = next.replace(/\\\(|\\\)/g, "").replace(/[()]/g, "").trim().toLowerCase();
          const cleanName = name.replace(/[()]/g, "").trim().toLowerCase();
          if (tagName === cleanName || tagName === cleanName.replace(/\s+/g, "_")) return "";
          next = next.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), descriptor);
        }
        return next.trim();
      })
      .filter(Boolean)).join(", ");
  }

  let next = value;
  for (const [name, descriptor] of replacements) {
    next = next.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), descriptor);
  }
  return next.replace(/\s+/g, " ").trim();
}

function buildCharacterTagReference(map: Record<string, string>): string {
  const lines = Object.entries(map)
    .map(([rawName, rawTags]) => {
      const name = normalizeCharacterName(rawName);
      const tags = normalizeReferenceTags(rawTags);
      return name && tags ? `- ${name}: ${tags}` : "";
    })
    .filter(Boolean);
  return lines.length ? ["## Previous Character Tags", ...lines].join("\n") : "";
}

function joinSections(sections: string[], syntax: Config["promptSyntax"]): string {
  const clean = sections.map((s) => s.trim()).filter(Boolean);
  return syntax === "comfyui" ? clean.join(",\n") : clean.join(", ");
}

function renderPrompt(prompt: AssembledPrompt, syntax: Config["promptSyntax"]): string {
  const supplementIndex = Math.min(Math.max(prompt.supplementAfterTagSections, 0), prompt.tagSections.length);
  return joinSections([
    ...prompt.tagSections.slice(0, supplementIndex),
    prompt.supplement,
    ...prompt.tagSections.slice(supplementIndex)
  ], syntax);
}

function activePromptPreset(config: Config): PromptPreset | null {
  return config.promptPresets.find((preset) => preset.id === config.activePromptPresetId) || null;
}

function characterTags(character: CharacterJson, config: Config, includeAction = true): string {
  return unique(csvParts(
    character.label,
    shouldIncludeCharacterNames(config) ? displayName(cleanString(character.name), config) : "",
    character.age,
    character.appearance,
    character.body,
    character.attire,
    character.expression,
    includeAction ? character.action : ""
  )).join(", ");
}

function dedupePromptSections(sections: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const section of sections.map((s) => s.trim()).filter(Boolean)) {
    const key = section.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(section);
  }
  return out;
}

function removeSupplementActionDuplicates(supplement: string, actionTags: string): string {
  let next = supplement.trim();
  for (const action of csvParts(actionTags)) {
    next = next.replace(new RegExp(`\\b${escapeRegExp(action)}\\b`, "gi"), " ");
  }
  return next.replace(/\s+([,.])/g, "$1").replace(/\s+/g, " ").trim();
}

function assembleCharacterBlock(character: CharacterJson, config: Config, replacements: Map<string, string>, includeAction: boolean): string {
  return unique(csvParts(
    stripOrReplaceNames(cleanString(character.label), replacements, true),
    shouldIncludeCharacterNames(config) ? displayName(cleanString(character.name), config) : "",
    stripOrReplaceNames(cleanString(character.age), replacements, true),
    stripOrReplaceNames(cleanString(character.appearance), replacements, true),
    stripOrReplaceNames(cleanString(character.body), replacements, true),
    stripOrReplaceNames(cleanString(character.attire), replacements, true),
    stripOrReplaceNames(cleanString(character.expression), replacements, true),
    includeAction ? stripOrReplaceNames(cleanString(character.action), replacements, true) : ""
  )).join(", ");
}

function assembleAnimaPrompt(scene: SceneJson, shot: ShotJson, config: Config, replacements: Map<string, string>): AssembledPrompt {
  const maxCharacters = config.mode === "asset" ? 1 : config.maxCharacters;
  const characters = cleanArray<CharacterJson>(shot.characters).slice(0, maxCharacters);
  const characterBlocks = characters
    .map((character) => assembleCharacterBlock(character, config, replacements, false))
    .filter(Boolean);
  const sceneAction = stripOrReplaceNames(unique(csvParts(shot.action, ...characters.map((c) => c.action), config.mode === "asset" ? "looking at viewer" : "")).join(", "), replacements, true);
  const supplement = config.supplement
    ? stripOrReplaceNames(removeSupplementActionDuplicates(cleanString(shot.supplement), sceneAction), replacements, false)
    : "";
  const tagSections = dedupePromptSections([
    stripOrReplaceNames(unique(csvParts(shot.situation)).join(", "), replacements, true),
    ...characterBlocks,
    sceneAction,
    stripOrReplaceNames(unique(csvParts(shot.camera, config.mode === "asset" ? "portrait, cowboy shot" : "")).join(", "), replacements, true),
    stripOrReplaceNames(unique(csvParts(scene.place, config.mode === "asset" ? "white background, simple background" : "")).join(", "), replacements, true)
  ]);
  return { tagSections, supplement, supplementAfterTagSections: tagSections.length };
}

function assembleDefaultPrompt(scene: SceneJson, shot: ShotJson, config: Config, replacements: Map<string, string>): AssembledPrompt {
  const maxCharacters = config.mode === "asset" ? 1 : config.maxCharacters;
  const characters = cleanArray<CharacterJson>(shot.characters).slice(0, maxCharacters);
  const characterBlocks = characters
    .map((character) => assembleCharacterBlock(character, config, replacements, true))
    .filter(Boolean);
  const supplement = config.supplement ? stripOrReplaceNames(cleanString(shot.supplement), replacements, false) : "";
  const tagSections = dedupePromptSections([
    stripOrReplaceNames(unique(csvParts(shot.camera, shot.situation, shot.action, config.mode === "asset" ? "portrait, cowboy shot, looking at viewer" : "")).join(", "), replacements, true),
    stripOrReplaceNames(unique(csvParts(scene.place, config.mode === "asset" ? "white background, simple background" : "")).join(", "), replacements, true),
    ...characterBlocks
  ]);
  return { tagSections, supplement, supplementAfterTagSections: tagSections.length };
}

function assemblePrompt(scene: SceneJson, shot: ShotJson, config: Config, parserParagraph: number, originalParagraph: number): PromptEntry {
  const characters = cleanArray<CharacterJson>(shot.characters);
  const replacements = buildNameReplacementMap(characters);
  const core = config.promptStyle === "anima"
    ? assembleAnimaPrompt(scene, shot, config, replacements)
    : assembleDefaultPrompt(scene, shot, config, replacements);
  const preset = activePromptPreset(config);
  const presetPrefix = stripOrReplaceNames(preset?.positivePrefix || "", replacements, true);
  const prefix = stripOrReplaceNames(config.customPositivePrefix, replacements, true);
  const suffix = stripOrReplaceNames(config.customPositiveSuffix, replacements, true);
  const prefixes = [presetPrefix, prefix].filter(Boolean);
  return {
    prompt: {
      tagSections: [...prefixes, ...core.tagSections, suffix].map((section) => section.trim()).filter(Boolean),
      supplement: core.supplement,
      supplementAfterTagSections: prefixes.length + core.supplementAfterTagSections
    },
    negative: stripOrReplaceNames(unique(csvParts(preset?.negativePrefix, config.customNegative, shot.negative)).join(", "), replacements, true),
    paragraph: originalParagraph,
    parserParagraph
  };
}

function formatTargetParagraphs(paragraphs: PreparedParagraph[]): string {
  return paragraphs.map((paragraph) => `[P${paragraph.parserIndex}]\n${paragraph.text}`).join("\n\n");
}

function parserInstruction(paragraphs: PreparedParagraph[], targetSource: string, context: string, config: Config): string {
  const maxCharacters = config.mode === "asset" ? 1 : config.maxCharacters;
  const shotInstruction = config.mode === "asset"
    ? [
      "Asset mode: generate exactly one shot for each [P#] paragraph.",
      "Each shot must contain exactly one visible character.",
      "Force place to include white background, simple background.",
      "Favor clean reusable character portrait tags over narrative scene illustration tags."
    ].join("\n")
    : `Generate ${config.minImages}-${config.maxImages} shots total when possible.`;
  const source = config.originalReference
    ? [
      "Original Creation Tag:",
      config.originalCreationName || "(empty)",
      "Use full character names ONLY for the JSON name field.",
      "Output the character's name only: no parentheses, no creation tag, no source/work title, and no aliases.",
      "The extension adds the creation tag programmatically afterward.",
      "Do not include any parenthetical, source name, creation reference, title, or alias in name or any other field."
    ].join("\n")
    : "Use names only for the JSON name field as private memory keys. Names will not be included in final prompts. If not given, make a concise stable identifier that fits the description.";
  const supplement = config.supplement
    ? [
      "### Natural Language Supplement",
      "In supplement, describe the image in natural language for visible details that tags cannot express well, such as detailed composition, framing, character positions, interactions, unusual vantage points, or objective atmosphere/lighting.",
      "Use concise, minimal, telegraphic sentences. Be objective, not subjective interpretation.",
      "Unusual framing and vantage points are welcome, such as viewed through an object, reflected in a mirror, or partially obscured by foreground elements.",
      "When describing multiple people, do not use names. Identify people by visual position such as left girl, right boy, foreground character, or background character.",
      "Do not use supplement for smell, sound, internal sensations, invisible emotions, or prose narration."
    ].join("\n")
    : "Do not include supplement text.";
  return [
    "# Image Tagging System",
    "Tag the current message's paragraphs as Danbooru-style English image prompts. Output a single JSON object.",
    "## JSON Format",
    [
      "{",
      '  "scenes": [',
      "    {",
      '      "place": "string",',
      '      "shots": [',
      "        {",
      '          "paragraph": 0,',
      '          "camera": "string",',
      '          "situation": "string",',
      '          "action": "string",',
      '          "characters": [',
      "            {",
      '              "name": "string",',
      '              "label": "string",',
      '              "age": "string",',
      '              "identity": "string",',
      '              "appearance": "string",',
      '              "body": "string",',
      '              "attire": "string",',
      '              "expression": "string",',
      '              "action": "string"',
      "            }",
      '          ],',
      '          "supplement": "string",',
      '          "negative": "string"',
      "        }",
      "      ]",
      "    }",
      "  ]",
      "}"
    ].join("\n"),
    "- negative is optional. All other fields are required, though values may be empty strings when a field does not apply.",
    "- These are the ONLY allowed fields. Adding any unlisted field is a schema violation.",
    "## Scenes & Shots",
    "Scene = shots sharing one physical location.",
    "- Same location means same scene, multiple shots.",
    "- Location change means a new scene with its own place.",
    "Shot = one distinct visual moment: interaction, emotion, significant action, or clear framing change. Prefer closer framing over wide shots. Shots are independent, so repeat tags if the scene has not changed.",
    shotInstruction,
    "Paragraph mapping: current message uses [P#] numbering.",
    "- Each shot's paragraph must reference an existing [P#].",
    "- Never invent paragraph numbers outside the visible range.",
    "- Tag ONLY the current message. Recent context is for continuity only.",
    "## Tag Rules",
    "Use common, objective, visualizable Danbooru-style English tags. Do not invent tags; use simpler well-known equivalents if unsure. Do not use metaphors for tags.",
    "All fields are comma-separated tags except supplement, which is a short objective visual sentence.",
    `Character limit: max ${maxCharacters} visible character(s) per shot. Characters outside the limit should be represented only by visible partial body parts, such as out of frame, hand, arm, or legs. Do not output their expressions or attire. Only output visible body parts and actions when needed.`,
    config.mode === "asset" ? "Asset mode requires one character in characters[] for every shot, no group shots, no narrative background beyond a simple white background." : "",
    "Repeat tags if the situation or scene has not changed. Shots are independent, so repeated tags across shots are expected for persistent actions, attire, and location details.",
    "Current visual baseline memory fields are label, age, appearance, body, and attire. Scene-only fields are expression, action, camera, situation, place, supplement, and negative.",
    "## Field Reference",
    "### place - scene-level",
    "Start with interior or exterior when location is known, then add location, mood, lighting, time, weather, and prominent props. Prominent props should be color + object. Define once per scene; all shots in the scene share identical place.",
    "Do not include character names, actions, expressions, clothing, body traits, or camera framing in place.",
    "### camera - shot-level",
    "Perspective tags: from above, from behind, from below, from side, high up, sideways, straight-on, upside-down, pov.",
    "Framing tags: portrait, upper body, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, close-up, body-part focus.",
    "Use camera only for perspective and framing. Do not include actions, expressions, appearance, clothing, subject counts, or place.",
    "### situation - shot-level",
    "Strictly use character count/composition tags such as 1girl, 2girls, 1boy, 1girl, 1boy, other, solo, group, and nsfw only when explicitly visual.",
    "The total number of people should match the visible characters being described/tagged.",
    "Do not include names, numeric ages, appearance, attire, expression, action, camera, or place.",
    "### label",
    "Use girl, boy, or other regardless of age. For out-of-frame partial characters, use label plus out of frame and visible part, such as boy, out of frame, hand.",
    "### name - required",
    "Character name from the narrative. If unnamed, use a consistent identifier such as girl A, boy B, shopkeeper, guard, or stranger. Never empty; this is used for cross-message appearance tracking.",
    "Do not put character names in label, age, appearance, body, attire, expression, action, situation, camera, place, supplement, or negative.",
    "### age",
    "Visual age category only: child, aged down, mature male, mature female, aged up, or old. Based on appearance only.",
    "If characters appear late teens to early thirties, leave age blank.",
    "Never output numeric ages such as 18, 21, or 25.",
    "### identity",
    "Legacy/private recognition tags that are not part of the rolling baseline memory. Leave empty unless a non-clothing trait does not fit appearance or body.",
    "Use identity only for durable traits that help recognize the character across chats: species/race, notable scars or tattoos, distinctive non-clothing accessories only if permanent, or named archetype traits when visually stable.",
    "Do not include names, attire, expression, pose, action, camera, place, or supplement in identity.",
    "### appearance",
    "Identity traits: hair, eyes, skin, species/race, and distinguishing features.",
    "Hair: length, color, style. Always include when known.",
    "Eyes: color, shape, and visual modifiers such as heterochromia, tareme, tsurime, jitome, empty eyes, or dashed eyes. Always include when known.",
    "Skin: color and visible texture, such as dark skin, tan, red skin, metal skin, see-through body, or patchwork skin.",
    "Other: freckles, facial hair, scars, tattoos with location, symbol in eye, elf, demon, furry, androgynous, and other persistent identity traits.",
    "Do not include names, attire, expression, pose, action, camera, place, or supplement in appearance.",
    "### body",
    "Physique, height, body shape, build, and persistent body traits. Exclude normal/default traits.",
    "Examples: muscular, toned, skinny, plump, fat, curvy, petite, shortstack, pear-shaped figure, giant, tall, short, flat chest, small breasts, medium breasts, large breasts, broad shoulders, wide hips, thick thighs.",
    "appearance + body + attire form the rolling character baseline. Copy the SAME tags for the same character across all shots unless the current message clearly changes their present visual state. Camera framing never justifies omitting known baseline traits.",
    "Do not include clothing, expression, action, camera, place, or supplement in body.",
    "### attire",
    "All visible clothing and accessories, or visible lack of clothing, with color, material, and style for each.",
    "Disassemble uniforms into individual items. Always include color details using color names. Do not use vague color traits like colorful or gradient unless the text clearly describes them.",
    "Examples: white loose button-up shirt, black silk dress, side slit, sleeveless, long sleeves, oversized, gray tight jeans, pleated mini skirt, white ankle socks, bare feet, red baseball cap, small blue gem necklace, open shirt, torn clothes, unzipped, midriff.",
    "Use no shirt, no pants, bare feet, or similar absence tags when visually relevant.",
    "Do not include body traits, expressions, actions, camera, place, or names in attire.",
    "### expression",
    "Visible facial emotions and facial/eye states only: annoyed, angry, embarrassed, blush, grin, smile, crying, empty eyes, closed eyes.",
    "Do not include posture, gaze direction, clothing, body, action, camera, place, or names in expression.",
    "### action",
    "Use shot.action for global or relationship action that applies to the whole shot, such as two characters holding hands or one character guiding another.",
    "Use characters[].action for a single character's posture, gaze, pose, interactions, and visible actions. Use multiple tags if needed.",
    "Posture examples: standing, sitting on chair, on back, kneeling, spread legs, all fours, squatting, on stomach, on side.",
    "Gaze examples: looking at viewer, looking away, looking at another.",
    "Interaction examples: arm hug, leaning, heads together, carrying, piggyback, holding hands.",
    "Do not duplicate camera, place, situation counts, appearance, body, attire, or expression. Do not put the same action in multiple fields.",
    "### negative - optional",
    "Only if the client explicitly specifies negative prompt tags. Never infer negative tags.",
    supplement,
    "## Repetition is Consistency",
    "- If a detail appears in one shot and persists, tag it in all subsequent shots.",
    "- If an action or attire is still in motion or still present, repeat it in later shots.",
    "- When pov is used, the viewpoint should remain consistent until the text clearly changes it.",
    "- appearance + body + attire must be identical for the same character across all shots unless the current message explicitly changes their present visual state.",
    "## Data Priority",
    "1. Client comments or explicit user instructions in the current message override all instructions.",
    "2. Current message [P#] paragraphs are authoritative for scene content. Never restore outdated clothing, props, location, or actions from context.",
    config.characterTagContextEnabled ? "3. Character tag history is the current visual baseline for returning characters: label, age, appearance, body, and base attire." : "",
    config.characterTagContextEnabled ? "Use previous character tags as a baseline for returning characters, including base attire. Preserve specific baseline tags when not contradicted, such as short cut, white pupils, small breasts, black high school uniform, red sailor ribbon, black skirt, and white pantyhose." : "",
    config.characterTagContextEnabled ? "The current message is authoritative for the character's present visual state. It can update the baseline when it clearly changes clothing, lack of clothing, appearance, or body traits." : "",
    "## Weights",
    "Weights such as {tag}, [tag], N::tag::, and (tag:N) control emphasis. Never add, remove, or modify client-specified weights. Copy them exactly when they are present in the source text.",
    "## Output Format",
    "- Output raw JSON only.",
    "- One JSON object. No XML, HTML, YAML, markdown fences, comments, or prose.",
    "- Double-quoted keys and values. No trailing commas.",
    "- Validate bracket balance: every { has }, every [ has ].",
    "- Positive tags only unless client says otherwise.",
    "- English only.",
    "## Character Names",
    source,
    "Recent context:",
    context,
    "Target assistant message paragraphs:",
    targetSource
  ].join("\n\n");
}

function extractText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const obj = result as Record<string, unknown>;
    for (const key of ["content", "text", "message", "output"]) if (typeof obj[key] === "string") return obj[key];
  }
  return "";
}

const FUZZY_KEYS = [
  "scenes", "place", "shots", "paragraph", "camera", "situation", "characters", "label", "age", "identity", "appearance", "body", "attire",
  "expression", "action", "negative", "name", "scene", "positive", "quote", "supplement"
];

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_v, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(
        next[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev.splice(0, prev.length, ...next);
  }
  return prev[b.length];
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
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") starts.push(i);
    else if (char === "}" && starts.length > 0) {
      const start = starts.pop();
      if (start !== undefined) objects.push(text.slice(start, i + 1));
    }
  }
  return [...new Set(objects.sort((a, b) => b.length - a.length))];
}

function parseJson(text: string): ParsedPayload {
  const trimmed = text.trim().replace(/\\\(/g, "(").replace(/\\\)/g, ")");
  const whole = tryParseObject(trimmed);
  if (hasScenes(whole)) return whole;

  const unfenced = stripJsonFences(trimmed);
  const candidates = balancedObjects(unfenced);
  for (const candidate of candidates) {
    const parsed = tryParseObject(candidate);
    if (hasScenes(parsed)) return parsed;
  }

  const collectedGroups: SceneJson[] = [];
  const collectedShots: SceneJson[] = [];
  for (const candidate of candidates) {
    const parsed = tryParseObject(candidate);
    if (!parsed || typeof parsed !== "object") continue;
    const obj = parsed as SceneJson;
    if (Array.isArray(obj.shots)) collectedGroups.push(obj);
    else if (obj.paragraph !== undefined) collectedShots.push(obj);
  }
  if (collectedGroups.length > 0) return { scenes: collectedGroups };
  if (collectedShots.length > 0) return { scenes: collectedShots };
  throw new Error("Parser did not return usable JSON scenes.");
}

async function resolveParserConnection(config: Config, userId?: string): Promise<ParserConnection> {
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
  return {
    id: connection.id,
    name: connection.name,
    provider: connection.provider,
    model: connection.model
  };
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
    const text = extractText(await spindle.generate.raw({
      type: "raw",
      provider: connection.provider,
      model: config.parserModel || connection.model,
      connection_id: connection.id,
      messages,
      parameters: config.parserParameters,
      reasoning: { source: "off" },
      userId
    } as ParserGenerationRequest));
    logStage(config, "parser_llm_done", { outputLength: text.length });
    return text;
  } catch (err) {
    logStage(config, "parser_llm_error", { error: err instanceof Error ? err.message : String(err) }, "error");
    throw new Error(`Parser generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function parserMessages(systemContext: string, instruction: string, override: string): ParserGenerationRequest["messages"] {
  const messages: ParserGenerationRequest["messages"] = [
    { role: "system", content: "You are a strict JSON image prompt parser." }
  ];
  if (systemContext.trim()) messages.push({ role: "system", content: systemContext.trim() });
  messages.push({ role: "user", content: instruction });
  if (override.trim()) messages.push({
    role: "user",
    content: [
      "Final user instructions override lower-priority parser guidance when they do not conflict with valid JSON output.",
      override.trim()
    ].join("\n\n")
  });
  return messages;
}

async function preprocessTargetParagraphs(
  parserConnection: ParserConnection,
  config: Config,
  paragraphs: PreparedParagraph[],
  context: ParserContext,
  userId?: string
): Promise<string> {
  const rawTarget = formatTargetParagraphs(paragraphs);
  if (!config.preprocessingEnabled || config.mode !== "illustration") return rawTarget;
  const instruction = [
    "# Illustration Tag Preprocessing",
    "Summarize the numbered assistant paragraphs into compact visual planning notes.",
    "Output plain text only in this exact shape:",
    "[Appearance: character name1: current visual baseline tags, character name2: current visual baseline tags]",
    "[P#]: Location/setting tags, camera angle, character actions and expressions.",
    "Keep every [P#] that appears in the input. Do not invent paragraph numbers.",
    "Use only visual details and concise English tags or short tag-like phrases.",
    context.recentContext ? `Recent context:\n${context.recentContext}` : "",
    "Target assistant message paragraphs:",
    rawTarget
  ].filter(Boolean).join("\n\n");
  try {
    const summary = cleanString(await generateParserText(parserConnection, config, parserMessages(context.systemContext, instruction, context.override), userId));
    const hasParagraphMarkers = paragraphs.every((paragraph) => summary.includes(`[P${paragraph.parserIndex}]`));
    if (summary && hasParagraphMarkers) {
      logStage(config, "preprocessing_done", { summaryLength: summary.length });
      return compactBlock(summary, 12000);
    }
    logStage(config, "preprocessing_fallback", { reason: "missing_markers", summaryLength: summary.length }, "warn");
  } catch (err) {
    logStage(config, "preprocessing_fallback", { reason: err instanceof Error ? err.message : String(err) }, "warn");
  }
  return rawTarget;
}

async function parsePayloadWithRepair(
  parserConnection: ParserConnection,
  config: Config,
  messages: ParserGenerationRequest["messages"],
  userId?: string
): Promise<ParsedPayload> {
  const raw = await generateParserText(parserConnection, config, messages, userId);
  try {
    logStage(config, "json_parse_start", { rawLength: raw.length, repair: false });
    const parsed = parseJson(raw);
    logStage(config, "json_parse_done", { repair: false });
    return parsed;
  } catch {
    logStage(config, "json_parse_failed", { rawLength: raw.length, repairWillRun: true }, "warn");
    const repaired = await generateParserText(parserConnection, config, [
      { role: "system", content: "Repair malformed JSON. Return only valid JSON." },
      { role: "user", content: raw }
    ], userId);
    const parsed = parseJson(repaired);
    logStage(config, "json_parse_done", { repair: true });
    return parsed;
  }
}

async function resolveImageConnection(config: Config, userId?: string): Promise<ImageConnection | null> {
  logStage(config, "image_connection_resolve_start", { configuredConnectionId: config.imageConnectionId });
  if (config.imageConnectionId) {
    const configured = await spindle.imageGen.getConnection(config.imageConnectionId, userId) as ImageConnection | null;
    if (configured) {
      logStage(config, "image_connection_resolved", {
        id: configured.id,
        name: configured.name,
        provider: configured.provider,
        model: configured.model,
        source: "configured"
      });
      return configured;
    }
    logStage(config, "image_connection_missing", { configuredConnectionId: config.imageConnectionId }, "warn");
  }
  const connections = await spindle.imageGen.listConnections(userId) as ImageConnection[];
  const fallback = connections.find((connection) => connection.is_default) || connections[0] || null;
  logStage(config, "image_connection_resolved", fallback ? {
    id: fallback.id,
    name: fallback.name,
    provider: fallback.provider,
    model: fallback.model,
    source: fallback.is_default ? "default" : "first_available"
  } : { source: "none", availableConnections: 0 }, fallback ? "info" : "warn");
  return fallback;
}

function readComfyConfig(metadata: unknown): ComfyUIConfig | null {
  if (!metadata || typeof metadata !== "object") return null;
  const comfy = (metadata as Record<string, unknown>).comfyui;
  if (!comfy || typeof comfy !== "object") return null;
  const config = comfy as ComfyUIConfig;
  const workflow = config.workflow_api_json || config.workflow_json;
  if (!workflow || typeof workflow !== "object" || !Array.isArray(config.field_mappings)) return null;
  return config;
}

function numberParam(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function patchComfyWorkflow(
  workflow: Record<string, unknown>,
  mappings: ComfyUIMapping[],
  values: Record<string, unknown>
): Record<string, unknown> {
  const patched = JSON.parse(JSON.stringify(workflow)) as Record<string, { inputs?: Record<string, unknown> }>;
  for (const mapping of mappings) {
    const node = patched[mapping.nodeId];
    if (!node || !node.inputs || typeof node.inputs !== "object") continue;
    const value = mapping.mappedAs === "custom"
      ? (values.custom && typeof values.custom === "object" ? (values.custom as Record<string, unknown>)[`${mapping.nodeId}:${mapping.fieldName}`] : undefined)
      : values[mapping.mappedAs];
    if (value !== undefined) node.inputs[mapping.fieldName] = value;
  }
  return patched as Record<string, unknown>;
}

async function buildImageParameters(
  config: Config,
  connection: ImageConnection | null,
  prompt: string,
  negative: string
): Promise<Record<string, unknown>> {
  const parameters = {
    ...(connection?.default_parameters || {}),
    ...config.imageParameters
  };
  logStage(config, "image_parameters_start", {
    provider: connection?.provider || "(default)",
    connectionId: connection?.id || null,
    promptLength: prompt.length,
    negativeLength: negative.length,
    parameterKeys: keysOf(parameters)
  });
  if (connection?.provider !== "comfyui" && connection?.provider !== "swarmui") {
    logStage(config, "image_parameters_ready", { provider: connection?.provider || "(default)", workflowPresent: Boolean(parameters.workflow) });
    return parameters;
  }
  if (parameters.workflow && typeof parameters.workflow === "object") {
    logStage(config, "comfy_workflow_existing", { parameterKeys: keysOf(parameters) });
    return parameters;
  }

  const comfy = readComfyConfig(connection.metadata);
  if (!comfy) {
    logStage(config, "comfy_workflow_missing", { metadataKeys: keysOf(connection.metadata) }, "warn");
    return parameters;
  }
  const workflow = comfy.workflow_api_json || comfy.workflow_json;
  const mappings = comfy.field_mappings || [];
  logStage(config, "comfy_workflow_config_found", {
    workflowSource: comfy.workflow_api_json ? "api" : "json",
    mappingCount: mappings.length,
    mappedAs: mappings.map((mapping) => mapping.mappedAs)
  });
  if (!mappings.some((mapping) => mapping.mappedAs === "positive_prompt")) {
    throw new Error("Imported ComfyUI workflow must map at least one positive prompt field");
  }

  const customValues = parameters.comfyui_custom_fields && typeof parameters.comfyui_custom_fields === "object"
    ? parameters.comfyui_custom_fields as Record<string, unknown>
    : parameters.custom && typeof parameters.custom === "object"
      ? parameters.custom as Record<string, unknown>
      : {};
  const values: Record<string, unknown> = {
    positive_prompt: prompt,
    negative_prompt: negative || parameters.negativePrompt,
    seed: numberParam(parameters.seed) ?? Math.floor(Math.random() * 2147483647),
    steps: numberParam(parameters.steps),
    cfg: numberParam(parameters.cfg),
    sampler_name: stringParam(parameters.sampler_name),
    scheduler: stringParam(parameters.scheduler),
    width: numberParam(parameters.width),
    height: numberParam(parameters.height),
    checkpoint: stringParam(parameters.checkpoint || parameters.ckpt_name)
  };
  values.custom = customValues;
  const patched = patchComfyWorkflow(workflow as Record<string, unknown>, mappings, values);
  logStage(config, "comfy_workflow_patched", {
    workflowPresent: true,
    workflowFormat: "api_prompt",
    parameterKeys: keysOf({ ...parameters, workflow: patched, workflowFormat: "api_prompt", preserveImportedWorkflow: true })
  });
  return { ...parameters, workflow: patched, workflowFormat: "api_prompt", preserveImportedWorkflow: true };
}

/**
 * Runs image requests in prompt order. ComfyUI accepts jobs into its own queue,
 * so callers can submit all jobs before waiting for any completion. Other
 * providers deliberately remain serial to preserve their rate-limit behavior.
 */
async function dispatchPreparedImageJobs<T>(
  jobs: PreparedImageJob[],
  eager: boolean,
  generate: (job: PreparedImageJob) => Promise<T> | T
): Promise<T[]> {
  if (!eager) {
    const results: T[] = [];
    for (const job of jobs) results.push(await generate(job));
    return results;
  }

  // Invoke every generator synchronously before awaiting any of their results.
  // allSettled is intentional: a failed job must not let us return while jobs
  // already accepted by ComfyUI are still running.
  const requests = jobs.map((job) => {
    try {
      return Promise.resolve(generate(job));
    } catch (err) {
      return Promise.reject(err);
    }
  });
  const settled = await Promise.allSettled(requests);
  const failure = settled.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return settled.map((result) => (result as PromiseFulfilledResult<T>).value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ignoredTagNames(config: Config): string[] {
  return unique(String(config.ignoredTags || "")
    .split(/[\n,]/)
    .map((tag) => tag.trim().replace(/^<|>$/g, "").replace(/^\/+/, ""))
    .filter(Boolean));
}

function splitParagraphBlocks(content: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    if (line.trim()) {
      current.push(line);
    } else if (current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

function stripIgnoredTags(text: string, config: Config): string {
  let out = text;
  for (const tag of ignoredTagNames(config)) {
    const name = escapeRegExp(tag);
    out = out
      .replace(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, "gi"), "")
      .replace(new RegExp(`<\\/?${name}\\b[^>]*>`, "gi"), "")
      .replace(new RegExp(`^\\s*\\[${name}\\b[^\\]]*\\]\\s*$`, "gim"), "");
  }
  return out;
}

function cleanParagraphText(text: string, config: Config): string {
  const stripped = stripIgnoredTags(text, config)
    .replace(/CARDDATA:.*$/gim, "")
    .replace(/<Update Log\b[\s\S]*?<\/Update Log>/gi, "")
    .replace(/<Choice\b[\s\S]*?<\/Choice>/gi, "");
  return stripped
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return !/^\[(?:Date|FLOOR|RESERVEDFLOOR)\s*:/i.test(trimmed)
        && !/^<\s*(?:suggestion|scene\s+seed=|check|choice)\b/i.test(trimmed);
    })
    .join("\n")
    .trim();
}

function prepareParagraphs(content: string, config: Config): PreparedParagraph[] {
  const paragraphs: PreparedParagraph[] = [];
  const originalBlocks = splitParagraphBlocks(content);
  let inInlay = false;
  for (const [index, block] of originalBlocks.entries()) {
    const trimmed = block.trim();
    const startsInlay = trimmed.includes(MARKER);
    if (startsInlay) {
      inInlay = /<details/i.test(trimmed) && !/<\/details>/i.test(trimmed);
      continue;
    }
    if (/^<details\b[\s\S]*<summary>\s*Prompt\b/i.test(trimmed)) {
      inInlay = !/<\/details>/i.test(trimmed);
      continue;
    }
    if (inInlay) {
      if (/<\/details>/i.test(trimmed)) inInlay = false;
      continue;
    }
    const cleaned = cleanParagraphText(block, config);
    if (cleaned) paragraphs.push({ parserIndex: paragraphs.length + 1, originalIndex: index + 1, text: cleaned });
  }
  return paragraphs;
}

function parseParagraphNumber(value: unknown): number | null {
  const match = String(value ?? "").match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeScenePayload(payload: ParsedPayload): NormalizedScene[] {
  const normalized: NormalizedScene[] = [];
  for (const rawScene of cleanArray<SceneJson>(payload.scenes)) {
    const parentPlace = cleanString(rawScene.place);
    const shots = cleanArray<ShotJson>(rawScene.shots);
    if (shots.length > 0) {
      for (const rawShot of shots) {
        const parserParagraph = parseParagraphNumber(rawShot.paragraph);
        if (!parserParagraph) continue;
        const shot: ShotJson = { ...rawShot, paragraph: parserParagraph };
        const scene: SceneJson = { ...rawScene, place: parentPlace, shots: [shot] };
        normalized.push({ scene, shot, parserParagraph });
      }
      continue;
    }

    const parserParagraph = parseParagraphNumber(rawScene.paragraph);
    if (!parserParagraph) continue;
    const situation = cleanString(rawScene.situation) || parentPlace;
    const shot: ShotJson = { ...rawScene, paragraph: parserParagraph, situation };
    const scene: SceneJson = { place: parentPlace, shots: [shot] };
    normalized.push({ scene, shot, parserParagraph });
  }
  return normalized;
}

function selectPromptEntries(payload: ParsedPayload, paragraphs: PreparedParagraph[], config: Config): PromptEntry[] {
  const byParserParagraph = new Map<number, PromptEntry>();
  const normalized = normalizeScenePayload(payload);
  for (const entry of normalized) {
    const paragraph = paragraphs[entry.parserParagraph - 1];
    if (!paragraph) continue;
    if (byParserParagraph.has(entry.parserParagraph)) continue;
    const prompt = assemblePrompt(entry.scene, entry.shot, config, entry.parserParagraph, paragraph.originalIndex);
    if (renderPrompt(prompt.prompt, config.promptSyntax)) byParserParagraph.set(entry.parserParagraph, prompt);
  }
  const limit = config.mode === "asset" ? paragraphs.length : config.maxImages;
  return [...byParserParagraph.entries()]
    .sort(([left], [right]) => left - right)
    .slice(0, limit)
    .map(([, entry]) => entry);
}

const VOLATILE_MEMORY_TERMS = [
  "sitting", "standing", "leaning", "guided", "guiding", "holding", "pulling", "looking", "gaze",
  "smug", "flustered", "blush", "smile", "angry", "crying", "grin", "embarrassed", "annoyed",
  "chair", "bed", "sofa", "couch", "desk", "table", "from above", "from below", "from behind", "close-up", "wide shot",
  "portrait", "upper body", "full body", "cowboy shot", "pov"
];

const TRANSIENT_ATTIRE_MEMORY_TERMS = [
  "torn clothes", "open shirt", "shirt lift", "panty pull", "clothes pull", "undressing"
];

function sanitizeMemoryTags(tags: string): string {
  return normalizeReferenceTags(csvParts(tags)
    .filter((tag) => {
      const normalized = tag.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
      if (!normalized) return false;
      if (TRANSIENT_ATTIRE_MEMORY_TERMS.some((term) => normalized === term || normalized.includes(term))) return false;
      return !VOLATILE_MEMORY_TERMS.some((term) => normalized === term || normalized.includes(term));
    })
    .join(", "));
}

function baselineCharacterTags(character: CharacterJson): string {
  return sanitizeMemoryTags(unique(csvParts(
    character.label,
    character.age,
    character.appearance,
    character.body,
    character.attire
  )).join(", "));
}

function updateCache(cache: Record<string, string>, payload: ParsedPayload): void {
  for (const { shot } of normalizeScenePayload(payload)) for (const character of cleanArray<CharacterJson>(shot.characters)) {
    const name = normalizeCharacterName(character.name);
    const tags = baselineCharacterTags(character);
    if (name && tags) cache[name] = tags;
  }
}

function upsertCharacterTag(state: State, oldName: unknown, nextName: unknown, nextTags: unknown): void {
  const previous = normalizeCharacterName(oldName);
  const name = normalizeCharacterName(nextName);
  const tags = sanitizeMemoryTags(normalizeReferenceTags(nextTags));
  if (previous && previous !== name) deleteCharacterTag(state, previous);
  if (name && tags) state.characterAppearance[name] = tags;
}

function deleteCharacterTag(state: State, name: unknown): void {
  const target = normalizeCharacterName(name);
  if (!target) return;
  const key = Object.keys(state.characterAppearance).find((candidate) => candidate.toLowerCase() === target.toLowerCase()) || target;
  delete state.characterAppearance[key];
}

function localCandidates(tag: string): string[] {
  const lower = tag.toLowerCase();
  const out: string[] = [];
  if (lower === "exterior") out.push("outdoors");
  if (lower === "smug smirk") out.push("smirk", "smug");
  if (lower.includes("pleated mini skirt")) out.push("pleated skirt", "miniskirt");
  if (lower === "revealing dark purple dress") out.push("purple dress", "revealing clothes");
  const hair = lower.match(/\b(long|short|medium)\s+(.+?)\s+hair\b/);
  if (hair) out.push(`${hair[2]} hair`, `${hair[1]} hair`);
  const eyes = lower.match(/\b(?:brilliant\s+)?(.+?)\s+(?:irises|eyes)\b/);
  if (eyes && !lower.includes("pupils")) out.push(`${eyes[1]} eyes`);
  return out;
}

async function cleanupPrompt(prompt: AssembledPrompt, config: Config): Promise<string> {
  if (!config.danbooruCleanup || !config.danbooruEndpoint.trim()) {
    logStage(config, "danbooru_cleanup_skipped", { enabled: config.danbooruCleanup, endpointConfigured: Boolean(config.danbooruEndpoint.trim()) });
    return renderPrompt(prompt, config.promptSyntax);
  }
  const sectionTags = prompt.tagSections.map((section) => csvParts(section));
  const tags = sectionTags.flat();
  const requestTags = unique(tags.flatMap((tag) => [tag, ...localCandidates(tag)]));
  const batches = Array.from(
    { length: Math.ceil(requestTags.length / DANBOORU_CLEANUP_BATCH_SIZE) },
    (_, index) => requestTags.slice(index * DANBOORU_CLEANUP_BATCH_SIZE, (index + 1) * DANBOORU_CLEANUP_BATCH_SIZE)
  );
  const cleanupStartedAt = Date.now();
  logStage(config, "danbooru_cleanup_start", {
    endpoint: config.danbooruEndpoint.trim(),
    tagCount: tags.length,
    requestTagCount: requestTags.length,
    batchCount: batches.length
  });
  try {
    const valid: string[] = [];
    const suggestions: Record<string, DanbooruSuggestion[]> = {};
    for (const [index, batch] of batches.entries()) {
      const batchNumber = index + 1;
      const batchStartedAt = Date.now();
      logStage(config, "danbooru_cleanup_batch_start", {
        batchNumber,
        batchCount: batches.length,
        tagCount: batch.length
      });
      try {
        const response = parseCorsJson<DanbooruPayload>(await spindle.cors(config.danbooruEndpoint.trim(), {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ tags: batch })
        }), `Danbooru cleanup batch ${batchNumber}/${batches.length}`);
        valid.push(...(response.valid || response.data?.valid || []));
        const batchSuggestions = response.suggestions || response.data?.suggestions || {};
        for (const [tag, entries] of Object.entries(batchSuggestions)) {
          suggestions[tag] = [...(suggestions[tag] || []), ...entries];
        }
        logStage(config, "danbooru_cleanup_batch_done", {
          batchNumber,
          batchCount: batches.length,
          tagCount: batch.length,
          elapsedMs: Date.now() - batchStartedAt
        });
      } catch (err) {
        logStage(config, "danbooru_cleanup_batch_failed", {
          batchNumber,
          batchCount: batches.length,
          tagCount: batch.length,
          elapsedMs: Date.now() - batchStartedAt,
          error: err instanceof Error ? err.message : String(err)
        }, "warn");
        throw err;
      }
    }
    const validKeys = new Set(valid.map((tag) => tag.toLowerCase()));
    const cleanTags = (section: string[]): string[] => {
      const expanded: string[] = [];
      for (const tag of section) {
        expanded.push(tag);
        for (const candidate of localCandidates(tag)) if (validKeys.size === 0 || validKeys.has(candidate.toLowerCase())) expanded.push(candidate);
        const best = (suggestions[tag] || []).filter((s) => s.tag && typeof s.score === "number").sort((a, b) => (b.score || 0) - (a.score || 0))[0];
        if (best?.tag && (best.score || 0) >= 0.88) expanded.push(best.tag);
      }
      return unique(expanded);
    };
    const seen = new Set<string>();
    const cleanedSections = sectionTags.map((section) => cleanTags(section)
      .filter((tag) => {
        const key = tag.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join(", "));
    const cleaned = renderPrompt({ ...prompt, tagSections: cleanedSections }, config.promptSyntax);
    logStage(config, "danbooru_cleanup_done", {
      beforeTagCount: tags.length,
      afterTagCount: cleanedSections.flatMap((section) => csvParts(section)).length,
      batchCount: batches.length,
      elapsedMs: Date.now() - cleanupStartedAt
    });
    return cleaned;
  } catch (err) {
    spindle.log.warn(`Danbooru cleanup skipped: ${err instanceof Error ? err.message : String(err)}`);
    return renderPrompt(prompt, config.promptSyntax);
  }
}

export const __testables = {
  DEFAULT_CONFIG,
  activePromptPreset,
  assemblePrompt,
  cleanupPrompt,
  dispatchPreparedImageJobs,
  normalizeConfig,
  renderPrompt
};

function isOwnMessage(message: { content?: string; metadata?: Record<string, unknown> }): boolean {
  return Boolean(message.metadata?.extension === EXTENSION_ID);
}

function imageUrlFromId(imageId: string): string {
  return `/api/v1/image-gen/results/${encodeURIComponent(imageId)}`;
}

function htmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderInlayBlock(url: string, prompt: string, index: number, config: Config): string {
  const label = `Inlay ${index + 1}`;
  const configuredWidth = config.mode === "asset" ? config.assetImageWidth : config.inlayImageWidth;
  const fallbackWidth = config.mode === "asset" ? DEFAULT_CONFIG.assetImageWidth : DEFAULT_CONFIG.inlayImageWidth;
  const width = clampInt(configuredWidth, 120, 2400, fallbackWidth);
  const maxHeight = clampInt(config.inlayImageMaxHeightVh, 10, 100, DEFAULT_CONFIG.inlayImageMaxHeightVh);
  const safePrompt = prompt.replace(/```/g, "'''");
  return `${MARKER}\n<div class="inlay-illustrator-image" data-inlay-illustrator="true" style="display:flex;justify-content:center;align-items:center;margin:10px 0;width:100%;"><img src="${htmlAttr(url)}" alt="${htmlAttr(label)}" data-lightbox data-inlay-illustrator-prompt="${htmlAttr(safePrompt)}" style="display:block;width:min(100%, ${width}px);max-height:${maxHeight}vh;height:auto;object-fit:contain;border-radius:8px;"/><pre class="inlay-illustrator-prompt" hidden>${htmlAttr(safePrompt)}</pre></div>`;
}

function paragraphCount(content: string): number {
  return content.split(/(\r?\n\s*\r?\n)/).filter((part) => part.trim()).length;
}

function renderInlaidMessage(original: string, record: { imageUrls: string[]; prompts: string[]; paragraphs: number[] }, config: Config): string {
  const blocks = new Map<number, string[]>();
  const count = Math.max(1, paragraphCount(original));
  record.imageUrls.forEach((url, index) => {
    const paragraph = clampInt(record.paragraphs[index], 1, count, Math.min(index + 1, count));
    const existing = blocks.get(paragraph) || [];
    existing.push(renderInlayBlock(url, record.prompts[index] || "", index, config));
    blocks.set(paragraph, existing);
  });

  const tokens = original.trimEnd().split(/(\r?\n\s*\r?\n)/);
  let paragraph = 0;
  const out: string[] = [];
  for (const token of tokens) {
    if (!token.trim()) {
      out.push(token);
      continue;
    }
    paragraph += 1;
    const inlays = blocks.get(paragraph);
    if (inlays?.length) out.push(`${inlays.join("\n\n")}\n\n`);
    out.push(token);
  }
  const unused = [...blocks.entries()].filter(([para]) => para > paragraph).flatMap(([, inlays]) => inlays);
  if (unused.length) out.push(`\n\n${unused.join("\n\n")}`);
  return out.join("");
}

async function generateForMessage(chatId: string, messageId: string, content: string, userId?: string): Promise<void> {
  const config = await getConfig(userId);
  logStage(config, "request_received", { chatId, messageId, contentLength: content.length, enabled: config.enabled, autoGenerate: config.autoGenerate });
  if (!config.enabled) {
    logStage(config, "request_skipped", { reason: "disabled", chatId, messageId });
    return;
  }
  const messages = await spindle.chat.getMessages(chatId);
  const target = messages.find((m) => m.id === messageId);
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
    const paragraphs = prepareParagraphs(content || target.content || "", config);
    logStage(config, "paragraph_cleanup_done", {
      originalParagraphs: paragraphCount(String(content || target.content || "")),
      parserParagraphs: paragraphs.length,
      mappedOriginalParagraphs: paragraphs.map((paragraph) => paragraph.originalIndex),
      ignoredTagCount: ignoredTagNames(config).length
    });
    if (paragraphs.length === 0) throw new Error("No usable paragraphs found for image parsing.");
    const parserConnection = await resolveParserConnection(config, userId);
    const typedMessages = messages as ChatMessage[];
    const targetIndex = Math.max(0, typedMessages.findIndex((m) => m.id === messageId));
    let parsed: ParsedPayload | null = null;
    let selected: PromptEntry[] = [];
    let lastParserError: unknown = null;
    for (let attempt = 0; attempt <= config.parserRetries; attempt += 1) {
      try {
        const context = await buildParserContext(chatId, typedMessages, targetIndex, state.characterAppearance, config, attempt, userId);
        const targetSource = await preprocessTargetParagraphs(parserConnection, config, paragraphs, context, userId);
        const instruction = parserInstruction(paragraphs, targetSource, context.recentContext, config);
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
        parsed = await parsePayloadWithRepair(parserConnection, config, parserMessages(context.systemContext, instruction, context.override), userId);
        selected = selectPromptEntries(parsed, paragraphs, config);
        if (selected.length === 0) throw new Error("No usable prompts were parsed.");
        break;
      } catch (err) {
        lastParserError = err;
        logStage(config, "parser_attempt_failed", { attempt, retries: config.parserRetries, error: err instanceof Error ? err.message : String(err) }, attempt >= config.parserRetries ? "error" : "warn");
        if (attempt >= config.parserRetries) throw err;
      }
    }
    if (!parsed) throw new Error(lastParserError instanceof Error ? lastParserError.message : "Parser did not return usable prompts.");
    updateCache(state.characterAppearance, parsed);
    // The parser is the source of truth for rolling appearance memory. Persist
    // its result before any image request so a provider failure cannot discard
    // a successfully parsed visual baseline.
    await writeJson(`states/${chatId}.json`, state, userId);
    spindle.sendToFrontend({
      type: "character_memory_updated",
      chatId,
      characterAppearance: state.characterAppearance
    }, userId);
    logStage(config, "character_memory_persisted", {
      chatId,
      characterCount: Object.keys(state.characterAppearance).length
    });
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
    const imageConnection = await resolveImageConnection(config, userId);
    const preparationStartedAt = Date.now();
    logStage(config, "image_generation_preparation_start", {
      total: selected.length,
      provider: imageConnection?.provider || "(default)",
      connectionId: imageConnection?.id || null
    });
    const preparedJobs: PreparedImageJob[] = [];
    for (const [index, entry] of selected.entries()) {
      const jobStartedAt = Date.now();
      logStage(config, "image_generation_preparation_job_start", { index: index + 1, total: selected.length, paragraph: entry.paragraph });
      const prompt = await cleanupPrompt(entry.prompt, config);
      const parameters = await buildImageParameters(config, imageConnection, prompt, entry.negative || "");
      preparedJobs.push({
        index,
        total: selected.length,
        prompt,
        negative: entry.negative || "",
        paragraph: entry.paragraph,
        parameters
      });
      logStage(config, "image_generation_prepared", {
        index: index + 1,
        total: selected.length,
        paragraph: entry.paragraph,
        elapsedMs: Date.now() - jobStartedAt,
        preparationElapsedMs: Date.now() - preparationStartedAt,
        promptLength: prompt.length,
        parameterKeys: keysOf(parameters)
      });
    }
    logStage(config, "image_generation_preparation_done", {
      total: preparedJobs.length,
      elapsedMs: Date.now() - preparationStartedAt,
      provider: imageConnection?.provider || "(default)"
    });

    const eagerComfyQueueing = imageConnection?.provider === "comfyui";
    const submissionStartedAt = Date.now();
    const results = await dispatchPreparedImageJobs(preparedJobs, eagerComfyQueueing, (job) => {
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
      }, (err) => {
        logStage(config, "image_generation_failed", {
          index: job.index + 1,
          total: job.total,
          paragraph: job.paragraph,
          elapsedMs: Date.now() - submittedAt,
          error: err instanceof Error ? err.message : String(err)
        }, "error");
        throw err;
      });
    });

    const imageIds: string[] = [];
    const imageUrls: string[] = [];
    const finalPrompts = preparedJobs.map((job) => job.prompt);
    const finalParagraphs = preparedJobs.map((job) => job.paragraph);
    for (const [index, result] of results.entries()) {
      // Providers may return a directly usable URL. Keep imageId separately
      // for message metadata, and use Lumiverse's documented result route only
      // when the provider result has no URL.
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
    const record = { chatId, messageId, swipeId, prompts: finalPrompts, paragraphs: finalParagraphs, imageIds, imageUrls, rawJson: parsed, createdAt: new Date().toISOString() };
    state.generated[key] = record;
    await writeJson(`states/${chatId}.json`, state, userId);
    logStage(config, "state_persisted", { key, imageCount: imageIds.length, paragraphs: finalParagraphs });
    const nextContent = renderInlaidMessage(String(target.content || ""), record, config);
    logStage(config, "inlay_rendered", {
      originalLength: String(target.content || "").length,
      finalLength: nextContent.length,
      originalParagraphs: paragraphCount(String(target.content || "")),
      imageCount: imageUrls.length,
      paragraphs: finalParagraphs
    });
    await spindle.chat.updateMessage(chatId, messageId, {
      content: nextContent,
      metadata: {
        ...(target.metadata || {}),
        inlayIllustratorImageIds: imageIds,
        inlayIllustratorParagraphs: finalParagraphs,
        inlayIllustratorGeneratedAt: record.createdAt
      }
    });
    logStage(config, "message_updated", { chatId, messageId, imageIds, paragraphs: finalParagraphs });
    spindle.sendToFrontend({ type: "status", status: "Generated", record }, userId);
  } finally {
    running.delete(key);
  }
}

spindle.on("GENERATION_ENDED", async (payload, userId) => {
  let configForError: Config | null = null;
  try {
    const config = await getConfig(userId);
    configForError = config;
    logStage(config, "generation_ended_event", {
      chatId: payload.chatId,
      messageId: payload.messageId || null,
      generationType: payload.generationType || null,
      hasError: Boolean(payload.error),
      hasContent: Boolean(payload.content),
      contentLength: String(payload.content || "").length
    });
    if (!config.enabled || !config.autoGenerate || payload.error || !payload.messageId || !payload.content) return;
    if (payload.generationType === "continue" || payload.generationType === "impersonate") return;
    await generateForMessage(payload.chatId, payload.messageId, payload.content, userId);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logStage(configForError || { debugLogging: true }, "auto_generation_error", { error }, "error");
    spindle.log.error(`Auto generation failed: ${error}`);
    spindle.sendToFrontend({ type: "status", status: "Error", error }, userId);
  }
});

spindle.onFrontendMessage(async (payload: unknown, userId) => {
  const msg = payload as Record<string, unknown>;
  let configForError: Config | null = null;
  try {
    if (msg.type === "get_state") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(msg.chatId || "");
      logStage(config, "frontend_get_state", { chatId: chatId || null });
      await sendState(userId, chatId);
    } else if (msg.type === "set_config") {
      const next = await setConfig((msg.patch || {}) as Partial<Config>, userId);
      configForError = next;
      logStage(next, "frontend_set_config", { patchKeys: keysOf(msg.patch) });
      await sendState(userId, String(msg.chatId || ""));
    } else if (msg.type === "character_tags_update") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(msg.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      const state = await getState(chatId, userId);
      upsertCharacterTag(state, msg.oldName, msg.name, msg.tags);
      await writeJson(`states/${chatId}.json`, state, userId);
      logStage(config, "character_tags_update", { chatId, oldName: String(msg.oldName || ""), name: String(msg.name || "") });
      await sendState(userId, chatId);
    } else if (msg.type === "character_tags_delete") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(msg.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      const state = await getState(chatId, userId);
      deleteCharacterTag(state, msg.name);
      await writeJson(`states/${chatId}.json`, state, userId);
      logStage(config, "character_tags_delete", { chatId, name: String(msg.name || "") });
      await sendState(userId, chatId);
    } else if (msg.type === "generate_latest") {
      const config = await getConfig(userId);
      configForError = config;
      const chatId = String(msg.chatId || "");
      if (!chatId) throw new Error("Open a chat first.");
      logStage(config, "manual_generate_latest", { chatId });
      const messages = await spindle.chat.getMessages(chatId);
      const target = [...messages].reverse().find((m) => m.role === "assistant" && !isOwnMessage(m));
      if (!target) throw new Error("No assistant message found.");
      spindle.sendToFrontend({ type: "status", status: "Generating..." }, userId);
      await generateForMessage(chatId, target.id, target.content, userId);
    } else if (msg.type === "test_danbooru") {
      const config = await getConfig(userId);
      configForError = config;
      logStage(config, "danbooru_test_start", { endpoint: config.danbooruEndpoint });
      const result = parseCorsJson<DanbooruPayload>(await spindle.cors(config.danbooruEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ tags: ["1girl", "blonde hair", "red eyes"] })
      }), "Danbooru test");
      spindle.sendToFrontend({ type: "danbooru_test", ok: true, result }, userId);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logStage(configForError || { debugLogging: true }, "frontend_message_error", { type: String(msg.type || ""), error }, "error");
    spindle.log.error(error);
    spindle.sendToFrontend({ type: "status", status: "Error", error }, userId);
  }
});

spindle.log.info("Inlay Illustrator loaded.");
