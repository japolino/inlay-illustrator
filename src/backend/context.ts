import type { Config } from "../shared/config.js";
import type { ActivatedWorldInfoEntryDTO, WorldBookEntryDTO, WorldBookSourceDTO } from "lumiverse-spindle-types";
import { EXTENSION_ID } from "./constants.js";
import { stripInlayContent } from "./inlay-content.js";
import { buildContinuityContext } from "./continuity-context.js";
import type { ChatMessage, ParserContext, PreviousVisualState } from "./types.js";
import { asRecord, cleanString, compactBlock, unique } from "./utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

const MAX_ACTIVATED_LOREBOOK_ENTRIES = 24;
const COMPACT_LOREBOOK_LENGTH = 4000;
const FULL_LOREBOOK_LENGTH = 8000;

const TARGET_STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "because", "before", "being", "between", "could", "does", "from", "have",
  "into", "just", "more", "other", "over", "said", "same", "should", "than", "that", "their", "them", "then", "there", "these",
  "they", "this", "through", "under", "very", "were", "what", "when", "where", "which", "while", "with", "would", "your"
]);

const CHARACTER_VISUAL_PATTERN = /\b(?:appearance|attire|body|build|clothes?|clothing|coat|dress|eyes?|face|facial|freckles|hair|horns?|jacket|pants|robe|scar|shirt|shoes?|skin|skirt|species|suit|tail|tattoo|uniform|wears?|wearing|wings?)\b/i;
const SCENE_VISUAL_PATTERN = /\b(?:architecture|background|castle|city|clouds?|forest|interior|exterior|lamp|light|lighting|moonlight|night|palace|rain|room|snow|street|sunlight|temple|weather|weapon|window)\b/i;

type ResolvedLorebookEntry = {
  index: number;
  id: string;
  title: string;
  keys: string[];
  content: string;
  priority: number;
  source: "keyword" | "vector";
  score?: number;
  bookSource?: WorldBookSourceDTO;
};

export type LorebookContextSnapshot = {
  compact: string;
  full: string;
  compacted: boolean;
  hasCharacterVisualReference: boolean;
  diagnostics: Record<string, unknown>;
};

export const EMPTY_LOREBOOK_CONTEXT: LorebookContextSnapshot = {
  compact: "",
  full: "",
  compacted: false,
  hasCharacterVisualReference: false,
  diagnostics: { lorebookEntries: 0 }
};

export type ParserContextSources = {
  chat: Record<string, unknown> | null;
  persona: Record<string, unknown> | null;
  character: Record<string, unknown> | null;
  diagnostics: Record<string, unknown>;
};

export async function loadParserContextSources(
  chatId: string,
  config: Config,
  userId?: string,
  options: { fastBootstrapCharacter?: boolean } = {}
): Promise<ParserContextSources> {
  const diagnostics: Record<string, unknown> = {};
  if (config.fastMode) {
    // Fast Mode skips chat/persona context entirely. The one exception is a
    // character-card bootstrap on the first generation, when no durable
    // character tags exist yet; after that, cached character tags carry the
    // visual baseline without any character RPC.
    const needsChat = config.includeCharacterInfo && options.fastBootstrapCharacter === true;
    let chat: Record<string, unknown> | null = null;
    let character: Record<string, unknown> | null = null;
    if (needsChat) {
      try {
        chat = asRecord(await spindle.chats.get(chatId, userId));
        if (config.includeCharacterInfo && chat?.character_id) {
          character = asRecord(await spindle.characters.get(String(chat.character_id), userId));
        }
      } catch (error) {
        diagnostics.characterInfoError = error instanceof Error ? error.message : String(error);
      }
      diagnostics.fastBootstrapCharacter = true;
    } else {
      diagnostics.fastBootstrapCharacter = false;
    }
    diagnostics.fastMode = true;
    return { chat, persona: null, character, diagnostics };
  }
  const needsChat = config.includeCharacterInfo || config.includeLorebook || config.userInstructionsEnabled;
  const needsPersona = config.includeUserInfo || config.userInstructionsEnabled;
  const [chatResult, personaResult] = await Promise.allSettled([
    needsChat ? spindle.chats.get(chatId, userId) : Promise.resolve(null),
    needsPersona ? spindle.personas.getActive(userId) : Promise.resolve(null)
  ]);
  const chat = chatResult.status === "fulfilled" && chatResult.value ? asRecord(chatResult.value) : null;
  const persona = personaResult.status === "fulfilled" && personaResult.value ? asRecord(personaResult.value) : null;
  if (chatResult.status === "rejected") diagnostics.chatLookupError = chatResult.reason instanceof Error
    ? chatResult.reason.message : String(chatResult.reason);
  if (personaResult.status === "rejected") diagnostics.userInfoError = personaResult.reason instanceof Error
    ? personaResult.reason.message : String(personaResult.reason);

  let character: Record<string, unknown> | null = null;
  if (config.includeCharacterInfo && chat?.character_id) {
    try {
      character = asRecord(await spindle.characters.get(String(chat.character_id), userId));
    } catch (error) {
      diagnostics.characterInfoError = error instanceof Error ? error.message : String(error);
    }
  }
  return { chat, persona, character, diagnostics };
}

export function isOwnMessage(message: { content?: string; metadata?: Record<string, unknown> }): boolean {
  return Boolean(message.metadata?.extension === EXTENSION_ID);
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

function normalizedTerms(value: string): string[] {
  return unique((value.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || [])
    .map((term) => term.replace(/[_-]+/g, " "))
    .filter((term) => !TARGET_STOP_WORDS.has(term)));
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function includesTerm(value: string, term: string): boolean {
  const clean = normalizeSearchText(term);
  const source = normalizeSearchText(value);
  return clean.length >= 2 && ` ${source} `.includes(` ${clean} `);
}

function splitLorebookSegments(content: string): string[] {
  const paragraphs = content.replace(/\r\n/g, "\n").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const segments: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= 500) {
      segments.push(paragraph);
      continue;
    }
    const sentences = paragraph.split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
    if (sentences.length <= 1) {
      for (let offset = 0; offset < paragraph.length; offset += 500) segments.push(paragraph.slice(offset, offset + 500).trim());
    } else {
      segments.push(...sentences);
    }
  }
  return segments;
}

function targetOverlap(value: string, targetTerms: string[]): number {
  return targetTerms.reduce((count, term) => count + (includesTerm(value, term) ? 1 : 0), 0);
}

function entryRelevance(entry: ResolvedLorebookEntry, target: string, targetTerms: string[]): number {
  const directKeyMatches = entry.keys.filter((key) => includesTerm(target, key)).length;
  const titleMatch = entry.title && includesTerm(target, entry.title) ? 1 : 0;
  const sourceWeight = entry.source === "keyword" ? 15 : Math.max(0, 15 - Math.max(0, Number(entry.score || 0)) * 10);
  const scopeWeight: Record<WorldBookSourceDTO, number> = { character: 12, chat: 8, persona: 4, global: 0 };
  const priorityWeight = Math.max(-20, Math.min(20, entry.priority / 5));
  return directKeyMatches * 100 + titleMatch * 50 + sourceWeight + (entry.bookSource ? scopeWeight[entry.bookSource] : 0)
    + priorityWeight + Math.min(10, targetOverlap(entry.content, targetTerms));
}

function compactEntryContent(entry: ResolvedLorebookEntry, targetTerms: string[], maxLength: number): string {
  const segments = splitLorebookSegments(entry.content);
  if (segments.length === 0) return "";
  const ranked = segments.map((segment, index) => {
    const keyMatches = entry.keys.reduce((count, key) => count + (includesTerm(segment, key) ? 1 : 0), 0);
    const overlap = targetOverlap(segment, targetTerms);
    const visual = CHARACTER_VISUAL_PATTERN.test(segment) ? 8 : SCENE_VISUAL_PATTERN.test(segment) ? 4 : 0;
    return { segment, index, score: keyMatches * 8 + Math.min(8, overlap) + visual + (index === 0 ? 1 : 0) };
  }).sort((left, right) => right.score - left.score || left.index - right.index);

  const selected: Array<{ segment: string; index: number }> = [];
  let length = 0;
  for (const candidate of ranked) {
    const separator = selected.length ? 2 : 0;
    if (selected.length && length + separator + candidate.segment.length > maxLength) continue;
    const segment = selected.length === 0 && candidate.segment.length > maxLength
      ? truncateLorebookText(candidate.segment, maxLength)
      : candidate.segment;
    selected.push({ segment, index: candidate.index });
    length += separator + segment.length;
    if (length >= maxLength) break;
  }
  return selected.sort((left, right) => left.index - right.index).map(({ segment }) => segment).join("\n\n");
}

function lorebookHeader(entry: ResolvedLorebookEntry): string {
  const title = entry.title || entry.keys.join(", ") || `Entry ${entry.id}`;
  const keys = entry.keys.length ? `Keys: ${entry.keys.join(", ")}` : "";
  return [`### ${title}`, keys].filter(Boolean).join("\n");
}

function truncateLorebookText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const marker = "\n...[truncated]";
  if (maxLength <= marker.length) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - marker.length).trimEnd()}${marker}`;
}

function appendLorebookRows(rows: string[], maxLength: number): { block: string; count: number } {
  if (rows.length === 0) return { block: "", count: 0 };
  const prefix = "## Lorebook";
  const selected: string[] = [];
  let length = prefix.length;
  for (const row of rows) {
    const remaining = maxLength - length - 2;
    if (remaining <= 80) break;
    const next = truncateLorebookText(row, remaining);
    selected.push(next);
    length += next.length + 2;
    if (next.length < row.length) break;
  }
  return { block: [prefix, ...selected].join("\n\n"), count: selected.length };
}

function renderLorebookBlocks(entries: ResolvedLorebookEntry[], target: string): Pick<LorebookContextSnapshot, "compact" | "full" | "hasCharacterVisualReference"> & { compactEntries: number; fullEntries: number } {
  const targetTerms = normalizedTerms(target);
  const ranked = [...entries].sort((left, right) =>
    entryRelevance(right, target, targetTerms) - entryRelevance(left, target, targetTerms) || left.index - right.index
  );
  const fairEntryLimit = Math.max(360, Math.min(1200, Math.floor(3600 / Math.max(1, Math.min(ranked.length, 8)))));
  const compactRows = ranked.map((entry) => {
    const content = compactEntryContent(entry, targetTerms, fairEntryLimit);
    return { row: [lorebookHeader(entry), content].filter(Boolean).join("\n"), content };
  });
  const fullRows = ranked.map((entry) => [lorebookHeader(entry), entry.content].filter(Boolean).join("\n"));
  const compactRendered = appendLorebookRows(compactRows.map(({ row }) => row), COMPACT_LOREBOOK_LENGTH);
  const fullRendered = appendLorebookRows(fullRows, FULL_LOREBOOK_LENGTH);
  return {
    compact: compactRendered.block,
    full: fullRendered.block,
    hasCharacterVisualReference: compactRows.slice(0, compactRendered.count).some(({ content }) => CHARACTER_VISUAL_PATTERN.test(content)),
    compactEntries: compactRendered.count,
    fullEntries: fullRendered.count
  };
}

function activatedEntryRelevance(entry: ActivatedWorldInfoEntryDTO, target: string, index: number): number {
  const directKeyMatches = (entry.keys || []).filter((key) => includesTerm(target, key)).length;
  const titleMatch = entry.comment && includesTerm(target, entry.comment) ? 1 : 0;
  const sourceWeight = entry.source === "keyword" ? 15 : Math.max(0, 15 - Math.max(0, Number(entry.score || 0)) * 10);
  const scopeWeight: Record<WorldBookSourceDTO, number> = { character: 12, chat: 8, persona: 4, global: 0 };
  return directKeyMatches * 100 + titleMatch * 50 + sourceWeight + (entry.bookSource ? scopeWeight[entry.bookSource] : 0) - index / 1000;
}

async function resolveLorebookContent(content: string, chatId: string, userId?: string): Promise<{ content: string; resolved: boolean; diagnostics: number }> {
  if (!content || typeof spindle.macros?.resolve !== "function") return { content, resolved: false, diagnostics: 0 };
  try {
    const result = await spindle.macros.resolve(content, { chatId, userId, commit: false });
    return { content: cleanString(result.text) || content, resolved: true, diagnostics: Array.isArray(result.diagnostics) ? result.diagnostics.length : 0 };
  } catch {
    return { content, resolved: false, diagnostics: 0 };
  }
}

export async function buildLorebookContextSnapshot(
  chatId: string,
  target: string,
  config: Pick<Config, "includeLorebook">,
  userId?: string
): Promise<LorebookContextSnapshot> {
  if (!config.includeLorebook) return EMPTY_LOREBOOK_CONTEXT;
  try {
    const allActivated = await spindle.world_books.getActivated(chatId, userId);
    const activated = allActivated.map((entry, index) => ({ entry, index }))
      .sort((left, right) => activatedEntryRelevance(right.entry, target, right.index) - activatedEntryRelevance(left.entry, target, left.index))
      .slice(0, MAX_ACTIVATED_LOREBOOK_ENTRIES)
      .map(({ entry }) => entry);
    let resolvedCount = 0;
    let macroDiagnostics = 0;
    let fetchFailures = 0;
    const fetched = await Promise.all(activated.map(async (activatedEntry: ActivatedWorldInfoEntryDTO, index): Promise<ResolvedLorebookEntry | null> => {
      let full: WorldBookEntryDTO | null = null;
      try {
        full = await spindle.world_books.entries.get(activatedEntry.id, userId);
      } catch {
        full = null;
      }
      if (!full) fetchFailures += 1;
      const rawContent = cleanString(full?.content);
      const resolved = await resolveLorebookContent(rawContent, chatId, userId);
      if (resolved.resolved) resolvedCount += 1;
      macroDiagnostics += resolved.diagnostics;
      const title = cleanString(activatedEntry.comment) || cleanString(full?.comment);
      const keys = unique([...(activatedEntry.keys || []), ...(full?.key || [])].map((key) => cleanString(key)).filter(Boolean));
      const content = resolved.content || [title, keys.length ? `Keys: ${keys.join(", ")}` : ""].filter(Boolean).join("\n");
      if (!content) return null;
      return {
        index,
        id: activatedEntry.id,
        title,
        keys,
        content,
        priority: Number(full?.priority || 0),
        source: activatedEntry.source,
        score: activatedEntry.score,
        bookSource: activatedEntry.bookSource
      };
    }));
    const entries = fetched.filter((entry): entry is ResolvedLorebookEntry => Boolean(entry));
    const rendered = renderLorebookBlocks(entries, target);
    return {
      compact: rendered.compact,
      full: rendered.full,
      compacted: rendered.compact.length < rendered.full.length || rendered.compactEntries < entries.length,
      hasCharacterVisualReference: rendered.hasCharacterVisualReference,
      diagnostics: {
        lorebookEntries: entries.length,
        lorebookActivated: allActivated.length,
        lorebookSelected: activated.length,
        lorebookCompactEntries: rendered.compactEntries,
        lorebookFullEntries: rendered.fullEntries,
        lorebookCompactLength: rendered.compact.length,
        lorebookFullLength: rendered.full.length,
        lorebookMacroResolved: resolvedCount,
        lorebookMacroDiagnostics: macroDiagnostics,
        lorebookFetchFailures: fetchFailures
      }
    };
  } catch (error) {
    return {
      ...EMPTY_LOREBOOK_CONTEXT,
      diagnostics: { lorebookEntries: 0, lorebookError: error instanceof Error ? error.message : String(error) }
    };
  }
}

export function formatRecentContext(messages: ChatMessage[], targetIndex: number, includeCount: number): string {
  const previous: ChatMessage[] = [];
  const limit = includeCount > 0 ? includeCount : 2;
  for (let index = Math.min(targetIndex, messages.length) - 1; index >= 0 && previous.length < limit; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant" || isOwnMessage(message)) continue;
    const content = stripInlayContent(message.content);
    if (content.trim()) previous.unshift({ ...message, content });
  }
  // The sole prior assistant message is the greeting on the first post-greeting
  // turn. Include it even when Minimum context is zero so initial scene facts
  // are available without making later zero-context calls history-dependent.
  const selected = includeCount > 0 ? previous.slice(-includeCount) : previous.length === 1 ? previous : [];
  return compactBlock(selected.map((message) => `${message.role}: ${message.content}`).join("\n\n"), 8000);
}

function includeCountForAttempt(config: Config, attempt: number): number {
  if (config.includeMaxMessages <= config.includeMinMessages) return config.includeMinMessages;
  if (config.parserRetries <= 0) return config.includeMinMessages;
  const step = Math.ceil((config.includeMaxMessages - config.includeMinMessages) / config.parserRetries);
  return Math.min(config.includeMaxMessages, config.includeMinMessages + step * attempt);
}

export async function buildParserContext(
  chatId: string,
  messages: ChatMessage[],
  targetIndex: number,
  cache: Record<string, string>,
  config: Config,
  attempt: number,
  userId?: string,
  lorebookSnapshot?: LorebookContextSnapshot,
  previousVisualState?: PreviousVisualState,
  preparedSources?: ParserContextSources
): Promise<ParserContext> {
  const blocks: string[] = [];
  const preprocessingBlocks: string[] = [];
  const overrides: string[] = [];
  const diagnostics: Record<string, unknown> = { attempt, includeCount: includeCountForAttempt(config, attempt) };
  const sources = preparedSources || await loadParserContextSources(chatId, config, userId);
  const chat = sources.chat;
  Object.assign(diagnostics, sources.diagnostics);
  const pushBlock = (block: string, includeInPreprocessing = true): void => {
    if (!block) return;
    blocks.push(block);
    if (includeInPreprocessing) preprocessingBlocks.push(block);
  };

  if (chat) overrides.push(...collectExtraInstructionStrings(chat.metadata));

  if (config.includeUserInfo || config.userInstructionsEnabled) {
    if (sources.persona) {
      const record = sources.persona;
      const block = config.includeUserInfo ? formatInfoBlock("{{user}} Info", [
        namedField("Name", record.name),
        namedField("Title", record.title),
        namedField("Description", record.description)
      ]) : "";
      pushBlock(block);
      overrides.push(...collectExtraInstructionStrings(record.metadata));
      diagnostics.userInfo = Boolean(block);
    }
  }

  if (config.includeCharacterInfo && chat?.character_id) {
    if (sources.character) {
      const record = sources.character;
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
      pushBlock(block);
      overrides.push(...collectExtraInstructionStrings(record.extensions));
      diagnostics.characterInfo = Boolean(block);
    }
  }

  if (config.includeLorebook && !config.fastMode) {
    const target = messages[targetIndex]?.content || "";
    const snapshot = lorebookSnapshot || await buildLorebookContextSnapshot(chatId, target, config, userId);
    const block = attempt === 0 ? snapshot.compact : snapshot.full;
    pushBlock(block, false);
    Object.assign(diagnostics, snapshot.diagnostics, { lorebookMode: attempt === 0 ? "compact" : "full" });
  }

  const continuity = buildContinuityContext(cache, previousVisualState, config);
  continuity.blocks.forEach((block) => pushBlock(block));
  Object.assign(diagnostics, continuity.diagnostics, {
    continuityAuthorities: continuity.authorities
  });

  if (config.userInstructionsEnabled) overrides.unshift(config.customParserInstructions);
  return {
    systemContext: blocks.filter(Boolean).join("\n\n"),
    preprocessingSystemContext: preprocessingBlocks.filter(Boolean).join("\n\n"),
    recentContext: config.fastMode
      ? ""
      : formatRecentContext(messages, targetIndex, includeCountForAttempt(config, attempt)),
    override: unique(overrides.map((value) => cleanString(value)).filter(Boolean)).join("\n\n"),
    diagnostics
  };
}
