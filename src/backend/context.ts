import type { Config } from "../shared/config.js";
import { EXTENSION_ID } from "./constants.js";
import { stripInlayContent } from "./inlay-content.js";
import { buildCharacterTagReference } from "./prompt.js";
import type { ChatMessage, ParserContext } from "./types.js";
import { asRecord, cleanString, compactBlock, unique } from "./utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

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

export function formatRecentContext(messages: ChatMessage[], targetIndex: number, includeCount: number): string {
  if (includeCount <= 0) return "";
  const previous = messages
    .slice(0, Math.max(0, targetIndex))
    .filter((message) => message.role === "assistant" && !isOwnMessage(message))
    .map((message) => ({ ...message, content: stripInlayContent(message.content) }))
    .filter((message) => message.content.trim())
    .slice(-includeCount);
  return compactBlock(previous.map((message) => `${message.role}: ${message.content}`).join("\n\n"), 8000);
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
    } catch (error) {
      diagnostics.chatLookupError = error instanceof Error ? error.message : String(error);
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
    } catch (error) {
      diagnostics.userInfoError = error instanceof Error ? error.message : String(error);
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
    } catch (error) {
      diagnostics.characterInfoError = error instanceof Error ? error.message : String(error);
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
    } catch (error) {
      diagnostics.lorebookError = error instanceof Error ? error.message : String(error);
    }
  }

  if (config.characterTagContextEnabled) {
    const characterReference = buildCharacterTagReference(cache);
    if (characterReference) {
      blocks.push(`${characterReference}\nUse these as a baseline for returning characters (including their base attire). The current message always wins over this reference.`);
    }
    diagnostics.cacheCharacters = Object.keys(cache).length;
  }

  if (config.userInstructionsEnabled) overrides.unshift(config.customParserInstructions);
  return {
    systemContext: blocks.filter(Boolean).join("\n\n"),
    recentContext: formatRecentContext(messages, targetIndex, includeCountForAttempt(config, attempt)),
    override: unique(overrides.map((value) => cleanString(value)).filter(Boolean)).join("\n\n"),
    diagnostics
  };
}
