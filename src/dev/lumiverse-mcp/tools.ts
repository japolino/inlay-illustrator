/**
 * Tool implementations for the Inlay Illustrator live integration test driver.
 *
 * Each function is a plain async function returning a plain object so the MCP
 * transport layer stays thin and the logic is directly unit-testable with a
 * mocked fetch / stubbed client.
 *
 * Inlay semantics: Inlay Illustrator starts its automatic pipeline from the
 * Lumiverse GENERATION_ENDED event. Only a normal chat generation (POST
 * /api/v1/generate) emits that event; /generate/dry-run never does.
 */

import { DEFAULT_CONFIG, normalizeConfig, type Config } from "../../shared/config.js";
import { LumiverseError, type LumiverseClient, type MessageRecord, type GenerateStatusResponse } from "./client.js";
import { cleanNarrative, extractInlayBlocks, hasInlayMarkup, inferInlayStatus, type InlayBlock } from "./inlay-markers.js";

export type DebugFn = (message: string, details?: unknown) => void;

/** Test-driver state kept only in this process. */
export type DriverState = {
  characterId: string | null;
  chatId: string | null;
};

export type ToolContext = {
  client: LumiverseClient;
  state: DriverState;
  debug: DebugFn;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Bounded output helpers (no huge base64 / giant transcripts in results).
// ---------------------------------------------------------------------------

export const MAX_NARRATIVE_CHARS = 20_000;
export const MAX_MESSAGE_CHARS = 2_000;
export const MAX_LIST_LIMIT = 200;
export const MAX_BREAKDOWN_ENTRIES = 50;
export const MAX_INLAY_BLOCKS = 25;

export function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}\n…[truncated]`, truncated: true };
}

/** Only the Inlay-owned metadata keys, never a raw extra/metadata dump. */
export function inlayMetadata(message: MessageRecord): Record<string, unknown> {
  const extra = message.extra && typeof message.extra === "object" ? message.extra : {};
  const spindleMetadata = extra.spindle_metadata && typeof extra.spindle_metadata === "object"
    ? (extra.spindle_metadata as Record<string, unknown>)
    : {};
  const source = Object.keys(spindleMetadata).length > 0 ? spindleMetadata : extra;
  const output: Record<string, unknown> = {};
  for (const key of [
    "inlayIllustratorImageIds",
    "inlayIllustratorParagraphs",
    "inlayIllustratorGeneratedAt",
    "inlayIllustratorOperationId",
    "inlayIllustratorGenerationStatus"
  ]) {
    if (source[key] !== undefined) output[key] = source[key];
  }
  return output;
}

export function compactMessage(message: MessageRecord): Record<string, unknown> {
  const content = typeof message.content === "string" ? message.content : "";
  const bounded = truncate(content, MAX_MESSAGE_CHARS);
  return {
    id: message.id,
    is_user: message.is_user,
    name: message.name,
    index_in_chat: message.index_in_chat,
    send_date: message.send_date,
    created_at: message.created_at,
    content: bounded.text,
    content_truncated: bounded.truncated,
    inlay_metadata: inlayMetadata(message)
  };
}

// ---------------------------------------------------------------------------
// State guards
// ---------------------------------------------------------------------------

export function requireCharacter(ctx: ToolContext, explicit?: string): string {
  const characterId = explicit || ctx.state.characterId;
  if (!characterId) {
    throw new LumiverseError(
      "No character selected. Call lumiverse_select_character first or pass character_id.",
      "",
      null
    );
  }
  return characterId;
}

export function requireChat(ctx: ToolContext, explicit?: string): string {
  const chatId = explicit || ctx.state.chatId;
  if (!chatId) {
    throw new LumiverseError(
      "No chat selected. Call lumiverse_create_test_chat first or pass chat_id.",
      "",
      null
    );
  }
  return chatId;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export type StatusResult = {
  reachable: boolean;
  authenticated: boolean;
  auth_error: string | null;
  base_url: string;
  character_id: string | null;
  chat_id: string | null;
};

export async function lumiverseStatus(ctx: ToolContext): Promise<StatusResult> {
  const reachable = await ctx.client.probe();
  let authenticated = false;
  let authError: string | null = null;
  if (reachable) {
    try {
      await ctx.client.settings();
      authenticated = true;
    } catch (error) {
      authError = error instanceof Error ? error.message : String(error);
    }
  } else {
    authError = "Lumiverse is not reachable at the configured base URL.";
  }
  return {
    reachable,
    authenticated,
    auth_error: authError,
    base_url: ctx.client.baseUrl,
    character_id: ctx.state.characterId,
    chat_id: ctx.state.chatId
  };
}

const INLAY_EXTENSION_IDENTIFIER = "inlay-illustrator";
const CONFIG_ENUMS: Partial<Record<keyof Config, readonly string[]>> = {
  perspectiveMode: ["creative", "static", "dynamic", "asset"],
  promptStyle: ["default", "anima"],
  promptSyntax: ["nai", "comfyui"]
};

function configValueType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "string|null";
  return typeof value;
}

function changedConfigKeys(before: Config, after: Config): string[] {
  return Object.keys(DEFAULT_CONFIG).filter((key) =>
    JSON.stringify(before[key as keyof Config]) !== JSON.stringify(after[key as keyof Config])
  );
}

async function inlayState(
  ctx: ToolContext,
  chatId = ""
): Promise<{ config: Config; parserConnections: unknown[]; characterAppearance: Record<string, string>; chatId: string }> {
  const extensionId = await ctx.client.resolveExtensionId(INLAY_EXTENSION_IDENTIFIER);
  const response = await ctx.client.extensionMessage<Record<string, unknown>>(
    extensionId,
    { type: "get_state", chatId },
    { responseType: "state", timeoutMs: 20_000 }
  );
  const config = normalizeConfig((response.config || {}) as Partial<Config>);
  return {
    config,
    parserConnections: Array.isArray(response.parserConnections) ? response.parserConnections : [],
    characterAppearance: response.characterAppearance && typeof response.characterAppearance === "object"
      ? response.characterAppearance as Record<string, string>
      : {},
    chatId: String(response.chatId || chatId)
  };
}

export async function inlayDescribeConfig(ctx: ToolContext): Promise<Record<string, unknown>> {
  const state = await inlayState(ctx);
  const fields = Object.keys(DEFAULT_CONFIG).map((name) => {
    const key = name as keyof Config;
    return {
      name,
      type: configValueType(DEFAULT_CONFIG[key]),
      current: state.config[key],
      default: DEFAULT_CONFIG[key],
      ...(CONFIG_ENUMS[key] ? { allowed_values: CONFIG_ENUMS[key] } : {})
    };
  });
  return { extension: INLAY_EXTENSION_IDENTIFIER, config: state.config, fields, parser_connections: state.parserConnections };
}

export async function inlayPatchConfig(
  ctx: ToolContext,
  input: { patch: Record<string, unknown>; dry_run?: boolean }
): Promise<Record<string, unknown>> {
  const beforeState = await inlayState(ctx);
  const known = new Set(Object.keys(DEFAULT_CONFIG));
  const unknown = Object.keys(input.patch).filter((key) => !known.has(key));
  if (unknown.length) throw new LumiverseError(`Unknown Inlay config field(s): ${unknown.join(", ")}.`, "/api/ws", 400);
  const after = normalizeConfig({ ...beforeState.config, ...input.patch } as Partial<Config>);
  const changed = changedConfigKeys(beforeState.config, after);
  if (input.dry_run) return { dry_run: true, before: beforeState.config, after, changed_fields: changed };
  const extensionId = await ctx.client.resolveExtensionId(INLAY_EXTENSION_IDENTIFIER);
  const response = await ctx.client.extensionMessage<Record<string, unknown>>(
    extensionId,
    { type: "set_config", patch: input.patch, chatId: "" },
    { responseType: "config_updated", timeoutMs: 20_000 }
  );
  const persisted = normalizeConfig((response.config || {}) as Partial<Config>);
  return { dry_run: false, before: beforeState.config, after: persisted, changed_fields: changedConfigKeys(beforeState.config, persisted) };
}

export async function inlayResetConfig(
  ctx: ToolContext,
  input: { fields?: string[]; all?: boolean; confirm_all?: boolean }
): Promise<Record<string, unknown>> {
  if (input.all && input.confirm_all !== true) {
    throw new LumiverseError("confirm_all=true is required to reset every Inlay config field.", "/api/ws", 400);
  }
  const requested = input.all ? Object.keys(DEFAULT_CONFIG) : [...new Set(input.fields || [])];
  if (!requested.length) throw new LumiverseError("Provide fields or set all=true.", "/api/ws", 400);
  const unknown = requested.filter((key) => !(key in DEFAULT_CONFIG));
  if (unknown.length) throw new LumiverseError(`Unknown Inlay config field(s): ${unknown.join(", ")}.`, "/api/ws", 400);
  const patch = Object.fromEntries(requested.map((key) => [key, DEFAULT_CONFIG[key as keyof Config]]));
  const result = await inlayPatchConfig(ctx, { patch });
  return { ...result, reset_fields: requested };
}

export async function inlayGetCharacterTags(
  ctx: ToolContext,
  input: { chat_id?: string }
): Promise<Record<string, unknown>> {
  const chatId = requireChat(ctx, input.chat_id);
  const state = await inlayState(ctx, chatId);
  return { chat_id: chatId, character_tags: state.characterAppearance };
}

export async function inlayGetImageDetails(
  ctx: ToolContext,
  input: { chat_id?: string; message_id?: string; swipe_id?: number; image_index?: number; image_id?: string; image_url?: string }
): Promise<Record<string, unknown>> {
  const chatId = requireChat(ctx, input.chat_id);
  if (input.image_index === undefined && !input.image_id && !input.image_url) {
    throw new LumiverseError("Provide image_index, image_id, or image_url.", "/api/ws", 400);
  }
  const extensionId = await ctx.client.resolveExtensionId(INLAY_EXTENSION_IDENTIFIER);
  const requestId = crypto.randomUUID();
  const response = await ctx.client.extensionMessage<Record<string, unknown>>(
    extensionId,
    {
      type: "get_inlay_image_details",
      requestId,
      chatId,
      ...(input.message_id ? { messageId: input.message_id } : {}),
      ...(input.swipe_id !== undefined ? { swipeId: input.swipe_id } : {}),
      ...(input.image_index !== undefined ? { imageIndex: input.image_index } : {}),
      ...(input.image_id ? { imageId: input.image_id } : {}),
      ...(input.image_url ? { imageUrl: input.image_url } : {})
    },
    { responseType: "inlay_image_details_result", requestId, timeoutMs: 20_000 }
  );
  if (response.ok !== true) throw new LumiverseError(String(response.error || "Inlay image details lookup failed."), "/api/ws", 404);
  return {
    chat_id: chatId,
    message_id: input.message_id || null,
    image_id: input.image_id || null,
    image_index: input.image_index ?? null,
    prompt: String(response.prompt || ""),
    negative_prompt: String(response.negativePrompt || ""),
    perspective_mode: response.perspectiveMode ?? null,
    perspective_source: response.perspectiveSource ?? null,
    creative_concept: String(response.creativeConcept || "")
  };
}

export type ListCharactersResult = {
  characters: Array<{ id: string; name: string; tags: string[]; updated_at: number; image_id: string | null }>;
  total: number;
  limit: number;
  offset: number;
};

export async function lumiverseListCharacters(
  ctx: ToolContext,
  input: { search?: string; limit?: number; offset?: number }
): Promise<ListCharactersResult> {
  const limit = Math.max(1, Math.min(MAX_LIST_LIMIT, input.limit ?? 50));
  const offset = Math.max(0, input.offset ?? 0);
  const page = await ctx.client.listCharacters({ search: input.search, limit, offset });
  const data = Array.isArray(page.data) ? page.data : [];
  return {
    characters: data.map((character) => ({
      id: character.id,
      name: character.name,
      tags: Array.isArray(character.tags) ? character.tags : [],
      updated_at: character.updated_at,
      image_id: character.image_id ?? null
    })),
    total: page.total,
    limit,
    offset
  };
}

export const MAX_CHARACTER_FIELD_CHARS = 10_000;
export const MAX_CHARACTER_ARRAY_ITEMS = 50;

export type CharacterDetailResult = {
  character: Record<string, unknown>;
  truncated_fields: string[];
};

/**
 * Fetches the full character record (system_prompt, description, personality,
 * scenario, first_mes, mes_example, creator_notes, post_history_instructions,
 * tags, metadata). Long text fields are truncated and reported in
 * truncated_fields; array fields are capped at MAX_CHARACTER_ARRAY_ITEMS.
 */
export async function lumiverseGetCharacter(
  ctx: ToolContext,
  input: { character_id: string }
): Promise<CharacterDetailResult> {
  const character = await ctx.client.getCharacter(input.character_id);
  const truncatedFields: string[] = [];
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(character)) {
    if (typeof value === "string") {
      const bounded = truncate(value, MAX_CHARACTER_FIELD_CHARS);
      result[key] = bounded.text;
      if (bounded.truncated) truncatedFields.push(key);
    } else if (Array.isArray(value)) {
      const sliced = value.slice(0, MAX_CHARACTER_ARRAY_ITEMS);
      result[key] = sliced;
      if (sliced.length < value.length) truncatedFields.push(key);
    } else {
      result[key] = value;
    }
  }
  return { character: result, truncated_fields: truncatedFields };
}

export async function lumiverseSelectCharacter(
  ctx: ToolContext,
  input: { character_id: string }
): Promise<{ character_id: string; name: string }> {
  const character = await ctx.client.getCharacter(input.character_id);
  ctx.state.characterId = character.id;
  ctx.debug("selected character", { character_id: character.id });
  return { character_id: character.id, name: character.name };
}

export async function lumiverseCreateTestChat(
  ctx: ToolContext,
  input: { character_id?: string; name?: string }
): Promise<Record<string, unknown>> {
  const characterId = requireCharacter(ctx, input.character_id);
  const chat = await ctx.client.createChat({
    character_id: characterId,
    ...(input.name ? { name: input.name } : {})
  });
  ctx.state.chatId = chat.id;
  ctx.debug("created chat", { chat_id: chat.id, character_id: characterId });
  const page = await ctx.client.listMessages(chat.id, { tail: true, limit: 20 });
  const messages = (Array.isArray(page.data) ? page.data : []).map(compactMessage);
  return {
    chat: {
      id: chat.id,
      character_id: chat.character_id,
      name: chat.name,
      created_at: chat.created_at,
      updated_at: chat.updated_at
    },
    greeting_messages: messages,
    character_id: characterId,
    chat_id: chat.id
  };
}

function boundedDryRunMessages(messages: unknown[] | undefined): unknown[] {
  const list = Array.isArray(messages) ? messages.slice(0, 100) : [];
  return list.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    const record = entry as Record<string, unknown>;
    const content = typeof record.content === "string" ? record.content : "";
    const bounded = truncate(content, MAX_MESSAGE_CHARS);
    return {
      ...record,
      content: bounded.text,
      ...(bounded.truncated ? { content_truncated: true } : {})
    };
  });
}

export type DryRunResult = {
  chat_id: string;
  messages: unknown[];
  breakdown: unknown[];
  model: string | null;
  provider: string | null;
  parameters: Record<string, unknown>;
  usage: Record<string, unknown> | null;
  token_count: Record<string, unknown> | null;
  note: string;
};

export async function lumiverseDryRun(
  ctx: ToolContext,
  input: { chat_id?: string; user_input?: string; connection_id?: string; persona_id?: string; preset_id?: string }
): Promise<DryRunResult> {
  const chatId = requireChat(ctx, input.chat_id);
  const result = await ctx.client.dryRun({
    chat_id: chatId,
    ...(input.user_input ? { user_input: input.user_input } : {}),
    ...(input.connection_id ? { connection_id: input.connection_id } : {}),
    ...(input.persona_id ? { persona_id: input.persona_id } : {}),
    ...(input.preset_id ? { preset_id: input.preset_id } : {}),
    generation_type: "normal"
  });
  return {
    chat_id: chatId,
    messages: boundedDryRunMessages(result.messages),
    breakdown: Array.isArray(result.breakdown) ? result.breakdown.slice(0, MAX_BREAKDOWN_ENTRIES) : [],
    model: result.model ?? null,
    provider: result.provider ?? null,
    parameters: result.parameters ?? {},
    usage: result.usage ?? null,
    token_count: result.tokenCount ?? null,
    note: "Dry run only: prompt assembly and registered interceptors run, but no GENERATION_ENDED event is emitted, so Inlay's illustration pipeline does not execute."
  };
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

const GENERATION_POLL_INTERVAL_MS = 500;
const INLAY_POLL_INTERVAL_MS = 500;
const ASSISTANT_MESSAGE_GRACE_MS = 15_000;

export type GenerationPollOutcome = {
  terminal_status: "completed" | "stopped" | "error" | "timeout";
  completedMessageId?: string;
  error?: string;
  elapsed_ms: number;
};

export async function pollGeneration(
  ctx: ToolContext,
  chatId: string,
  generationId: string,
  timeoutMs: number
): Promise<GenerationPollOutcome> {
  const startedAt = ctx.now ? ctx.now() : Date.now();
  const deadline = startedAt + Math.max(0, timeoutMs);
  let lastStatus: GenerateStatusResponse = { active: true };
  while (true) {
    try {
      lastStatus = await ctx.client.generationStatus(chatId, { generationId });
    } catch (error) {
      return {
        terminal_status: "error",
        error: error instanceof Error ? error.message : String(error),
        elapsed_ms: (ctx.now ? ctx.now() : Date.now()) - startedAt
      };
    }
    ctx.debug("generation poll", { generationId, status: lastStatus.status ?? null, active: lastStatus.active });
    if (lastStatus.status === "completed" || (lastStatus.status === undefined && lastStatus.active === false)) {
      return {
        terminal_status: "completed",
        completedMessageId: lastStatus.completedMessageId ?? lastStatus.targetMessageId,
        elapsed_ms: (ctx.now ? ctx.now() : Date.now()) - startedAt
      };
    }
    if (lastStatus.status === "stopped") {
      return { terminal_status: "stopped", elapsed_ms: (ctx.now ? ctx.now() : Date.now()) - startedAt };
    }
    if (lastStatus.status === "error") {
      return {
        terminal_status: "error",
        error: lastStatus.error ?? "Generation ended with an error status.",
        elapsed_ms: (ctx.now ? ctx.now() : Date.now()) - startedAt
      };
    }
    if ((ctx.now ? ctx.now() : Date.now()) >= deadline) {
      return {
        terminal_status: "timeout",
        error: `Generation did not finish within ${timeoutMs} ms (last status: ${lastStatus.status ?? "unknown"}).`,
        elapsed_ms: timeoutMs
      };
    }
    if (ctx.sleep) await ctx.sleep(GENERATION_POLL_INTERVAL_MS);
    else await new Promise((resolve) => setTimeout(resolve, GENERATION_POLL_INTERVAL_MS));
  }
}

export async function findNewAssistantMessage(
  ctx: ToolContext,
  chatId: string,
  userMessageId: string,
  preferredMessageId: string | undefined,
  timeoutMs: number
): Promise<MessageRecord> {
  if (preferredMessageId) {
    try {
      const preferred = await ctx.client.getMessage(chatId, preferredMessageId);
      if (preferred && !preferred.is_user) return preferred;
    } catch {
      ctx.debug("preferred assistant message lookup failed; falling back to tail scan", { preferredMessageId });
    }
  }
  let userIndex = -1;
  try {
    const userMessage = await ctx.client.getMessage(chatId, userMessageId);
    userIndex = typeof userMessage?.index_in_chat === "number" ? userMessage.index_in_chat : -1;
  } catch {
    ctx.debug("user message lookup failed; falling back to index-free tail scan", { userMessageId });
  }
  const startedAt = ctx.now ? ctx.now() : Date.now();
  const deadline = startedAt + Math.min(Math.max(0, timeoutMs), ASSISTANT_MESSAGE_GRACE_MS);
  while (true) {
    const page = await ctx.client.listMessages(chatId, { tail: true, limit: 20 });
    const data = Array.isArray(page.data) ? page.data : [];
    const candidates = data.filter((message) => {
      if (message.is_user || message.id === userMessageId) return false;
      if (userIndex >= 0 && typeof message.index_in_chat === "number") return message.index_in_chat > userIndex;
      return true;
    });
    if (candidates.length > 0) {
      candidates.sort((left, right) => (right.index_in_chat ?? 0) - (left.index_in_chat ?? 0));
      return candidates[0];
    }
    if ((ctx.now ? ctx.now() : Date.now()) >= deadline) {
      throw new LumiverseError(
        "No assistant message appeared after generation completed. Check the chat for a stopped or failed generation.",
        `/api/v1/chats/${chatId}/messages`,
        null
      );
    }
    if (ctx.sleep) await ctx.sleep(GENERATION_POLL_INTERVAL_MS);
    else await new Promise((resolve) => setTimeout(resolve, GENERATION_POLL_INTERVAL_MS));
  }
}

export type InlayPollOutcome = {
  detected: boolean;
  status: string;
  imageIds: string[];
  imageUrls: string[];
  blocks: InlayBlock[];
  elapsed_ms: number;
  explanation: string | null;
};

function extensionErrorFrom(statusEvents: (() => import("./client.js").ExtensionStatusEvent[]) | undefined, chatId: string): string | null {
  if (!statusEvents) return null;
  for (const event of statusEvents()) {
    if (event.chatId && event.chatId !== chatId) continue;
    if (event.status.toLowerCase() === "error" && event.error) return event.error;
  }
  return null;
}

export async function pollInlayResult(
  ctx: ToolContext,
  chatId: string,
  assistantMessageId: string,
  timeoutMs: number,
  statusEvents?: () => import("./client.js").ExtensionStatusEvent[]
): Promise<InlayPollOutcome> {
  const startedAt = ctx.now ? ctx.now() : Date.now();
  const deadline = startedAt + Math.max(0, timeoutMs);
  while (true) {
    const extensionError = extensionErrorFrom(statusEvents, chatId);
    if (extensionError) {
      ctx.debug("inlay extension reported an error", { extensionError });
      return {
        detected: false,
        status: "error",
        imageIds: [],
        imageUrls: [],
        blocks: [],
        elapsed_ms: (ctx.now ? ctx.now() : Date.now()) - startedAt,
        explanation: `Inlay pipeline failed: ${extensionError}`
      };
    }
    const message = await ctx.client.getMessage(chatId, assistantMessageId);
    if (!message) {
      ctx.debug("assistant message not readable yet", { assistantMessageId });
      if ((ctx.now ? ctx.now() : Date.now()) >= deadline) {
        return {
          detected: false,
          status: "none",
          imageIds: [],
          imageUrls: [],
          blocks: [],
          elapsed_ms: timeoutMs,
          explanation: `No Inlay output detected within ${timeoutMs} ms. Check that the Inlay extension is enabled with autoGenerate on, its debugLogging option is on (logs appear as [Inlay:<stage>]), and that generation actually completed.`
        };
      }
      if (ctx.sleep) await ctx.sleep(INLAY_POLL_INTERVAL_MS);
      else await new Promise((resolve) => setTimeout(resolve, INLAY_POLL_INTERVAL_MS));
      continue;
    }
    const content = typeof message.content === "string" ? message.content : "";
    const metadata = inlayMetadata(message);
    const detected = hasInlayMarkup(content) || Object.keys(metadata).length > 0;
    const blocks = extractInlayBlocks(content);
    const imageIds = blocks.filter((block) => block.kind === "image" && block.imageId).map((block) => block.imageId as string);
    const imageUrls = blocks.filter((block) => block.kind === "image" && block.imageUrl).map((block) => block.imageUrl as string);
    const status = inferInlayStatus(content, metadata);
    ctx.debug("inlay poll", { detected, status, blocks: blocks.length });
    if (detected) {
      return {
        detected: true,
        status,
        imageIds: imageIds.slice(0, MAX_INLAY_BLOCKS),
        imageUrls: imageUrls.slice(0, MAX_INLAY_BLOCKS),
        blocks: blocks.slice(0, MAX_INLAY_BLOCKS),
        elapsed_ms: (ctx.now ? ctx.now() : Date.now()) - startedAt,
        explanation: null
      };
    }
    if ((ctx.now ? ctx.now() : Date.now()) >= deadline) {
      return {
        detected: false,
        status: "none",
        imageIds: [],
        imageUrls: [],
        blocks: [],
        elapsed_ms: timeoutMs,
        explanation: `No Inlay output detected within ${timeoutMs} ms. Check that the Inlay extension is enabled with autoGenerate on, its debugLogging option is on (logs appear as [Inlay:<stage>]), and that generation actually completed.`
      };
    }
    if (ctx.sleep) await ctx.sleep(INLAY_POLL_INTERVAL_MS);
    else await new Promise((resolve) => setTimeout(resolve, INLAY_POLL_INTERVAL_MS));
  }
}

export type SendTestTurnResult = {
  chat_id: string;
  user_message_id: string;
  generation_id: string;
  assistant_message_id: string | null;
  assistant_text: string;
  assistant_text_truncated: boolean;
  inlay_detected: boolean;
  inlay_status: string;
  image_ids: string[];
  image_urls: string[];
  inlay_blocks: InlayBlock[];
  elapsed_generation_ms: number;
  elapsed_inlay_ms: number;
  terminal_status: "completed" | "stopped" | "error" | "timeout";
  generation_error: string | null;
  explanation: string | null;
};

export async function inlaySendTestTurn(
  ctx: ToolContext,
  input: {
    chat_id?: string;
    content: string;
    user_name?: string;
    connection_id?: string;
    persona_id?: string;
    preset_id?: string;
    generation_timeout_ms?: number;
    inlay_timeout_ms?: number;
  }
): Promise<SendTestTurnResult> {
  const chatId = requireChat(ctx, input.chat_id);
  const content = input.content.trim();
  if (!content) throw new LumiverseError("content is required and must not be empty.", "", null);

  const userMessage = await ctx.client.createMessage(chatId, {
    is_user: true,
    name: input.user_name?.trim() || "Test User",
    content
  });
  ctx.debug("user message created", { message_id: userMessage.id });

  const generation = await ctx.client.startGeneration({
    chat_id: chatId,
    user_input: content,
    ...(input.connection_id ? { connection_id: input.connection_id } : {}),
    ...(input.persona_id ? { persona_id: input.persona_id } : {}),
    ...(input.preset_id ? { preset_id: input.preset_id } : {}),
    generation_type: "normal"
  });
  const generationId = generation.generationId;
  ctx.debug("generation started", { generation_id: generationId });

  const generationOutcome = await pollGeneration(ctx, chatId, generationId, input.generation_timeout_ms ?? 120_000);

  // Only a completed generation produces the assistant message Inlay will
  // decorate. Stopped/errored/timed-out generations short-circuit with the
  // generation outcome and a clear explanation instead of polling for a
  // message that may never appear.
  if (generationOutcome.terminal_status !== "completed") {
    return {
      chat_id: chatId,
      user_message_id: userMessage.id,
      generation_id: generationId,
      assistant_message_id: null,
      assistant_text: "",
      assistant_text_truncated: false,
      inlay_detected: false,
      inlay_status: "none",
      image_ids: [],
      image_urls: [],
      inlay_blocks: [],
      elapsed_generation_ms: generationOutcome.elapsed_ms,
      elapsed_inlay_ms: 0,
      terminal_status: generationOutcome.terminal_status,
      generation_error: generationOutcome.error ?? null,
      explanation: `Main text generation ${generationOutcome.terminal_status}${generationOutcome.error ? `: ${generationOutcome.error}` : ""}; Inlay's GENERATION_ENDED pipeline was not reached.`
    };
  }

  const assistantMessage = await findNewAssistantMessage(
    ctx,
    chatId,
    userMessage.id,
    generationOutcome.completedMessageId,
    input.generation_timeout_ms ?? 120_000
  );

  // Listen for the extension's live status events so a failed Inlay pipeline
  // (e.g. parser errors after GENERATION_ENDED) surfaces immediately instead
  // of being mistaken for a silent timeout.
  let monitor: import("./client.js").ExtensionStatusMonitor | null = null;
  try {
    monitor = await ctx.client.openExtensionStatusMonitor(
      await ctx.client.resolveExtensionId(),
      chatId,
      (input.inlay_timeout_ms ?? 300_000) + 30_000
    );
  } catch (error) {
    ctx.debug("status monitor unavailable", { error: error instanceof Error ? error.message : String(error) });
  }
  const statusEvents = monitor ? () => monitor!.events() : undefined;

  const inlayOutcome = await pollInlayResult(ctx, chatId, assistantMessage.id, input.inlay_timeout_ms ?? 300_000, statusEvents);

  if (monitor) monitor.close();

  const boundedNarrative = truncate(cleanNarrative(assistantMessage.content), MAX_NARRATIVE_CHARS);

  return {
    chat_id: chatId,
    user_message_id: userMessage.id,
    generation_id: generationId,
    assistant_message_id: assistantMessage.id,
    assistant_text: boundedNarrative.text,
    assistant_text_truncated: boundedNarrative.truncated,
    inlay_detected: inlayOutcome.detected,
    inlay_status: inlayOutcome.status,
    image_ids: inlayOutcome.imageIds,
    image_urls: inlayOutcome.imageUrls,
    inlay_blocks: inlayOutcome.blocks,
    elapsed_generation_ms: generationOutcome.elapsed_ms,
    elapsed_inlay_ms: inlayOutcome.elapsed_ms,
    terminal_status: generationOutcome.terminal_status,
    generation_error: generationOutcome.error ?? null,
    explanation: inlayOutcome.explanation
  };
}

export type GetResultResult = {
  chat_id: string;
  message_id: string;
  clean_narrative: string;
  clean_narrative_truncated: boolean;
  inlay_markup: boolean;
  inlay_status: string;
  image_ids: string[];
  image_urls: string[];
  inlay_blocks: InlayBlock[];
  inlay_metadata: Record<string, unknown>;
  message: {
    id: string;
    is_user: boolean;
    name: string;
    index_in_chat: number;
    send_date: number;
    created_at: number;
  };
};

export async function inlayGetResult(
  ctx: ToolContext,
  input: { chat_id?: string; message_id?: string }
): Promise<GetResultResult> {
  const chatId = requireChat(ctx, input.chat_id);
  let messageId = input.message_id;
  if (!messageId) {
    const page = await ctx.client.listMessages(chatId, { tail: true, limit: 20 });
    const data = Array.isArray(page.data) ? page.data : [];
    const assistant = data.filter((message) => !message.is_user).sort((a, b) => (b.index_in_chat ?? 0) - (a.index_in_chat ?? 0))[0];
    if (!assistant) throw new LumiverseError("No assistant message found in this chat.", `/api/v1/chats/${chatId}/messages`, null);
    messageId = assistant.id;
  }
  const message = await ctx.client.getMessage(chatId, messageId);
  const content = typeof message.content === "string" ? message.content : "";
  const bounded = truncate(cleanNarrative(content), MAX_NARRATIVE_CHARS);
  const metadata = inlayMetadata(message);
  const blocks = extractInlayBlocks(content);
  return {
    chat_id: chatId,
    message_id: message.id,
    clean_narrative: bounded.text,
    clean_narrative_truncated: bounded.truncated,
    inlay_markup: hasInlayMarkup(content),
    inlay_status: inferInlayStatus(content, metadata),
    image_ids: blocks.filter((block) => block.kind === "image" && block.imageId).map((block) => block.imageId as string).slice(0, MAX_INLAY_BLOCKS),
    image_urls: blocks.filter((block) => block.kind === "image" && block.imageUrl).map((block) => block.imageUrl as string).slice(0, MAX_INLAY_BLOCKS),
    inlay_blocks: blocks.slice(0, MAX_INLAY_BLOCKS),
    inlay_metadata: metadata,
    message: {
      id: message.id,
      is_user: message.is_user,
      name: message.name,
      index_in_chat: message.index_in_chat,
      send_date: message.send_date,
      created_at: message.created_at
    }
  };
}
