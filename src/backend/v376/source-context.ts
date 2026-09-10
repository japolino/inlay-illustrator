/**
 * V3.7.6 Host Source Loading Adapter.
 * Loads persona (userInfo, userName), character (charInfo, charName), lorebooks,
 * and user instruction overrides faithfully from Lumiverse Spindle host environment
 * without legacy ANIMA visual heuristics, truncation, or fastMode steering.
 */

import type { Config } from "../../shared/config.js";
import { loadParserContextSources } from "../context.js";
import { cleanString, unique } from "../utils.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

export interface V376LoadedHostSources {
  userName?: string;
  charName?: string;
  userInfo?: string;
  charInfo?: string;
  lorebooks?: Array<{ content: string; title?: string }>;
  customOverride?: string;
}

function namedField(label: string, value: unknown): string {
  const text = cleanString(value);
  return text ? `${label}: ${text}` : "";
}

function findNestedString(root: unknown, path: string[]): string {
  let current: unknown = root;
  for (const part of path) {
    if (!current || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  return cleanString(current);
}

function collectExtraInstructionStrings(root: unknown): string[] {
  const values = [
    findNestedString(root, ["lb-xnai", "lb", "extra"]),
    findNestedString(root, ["lb_xnai", "lb", "extra"]),
    findNestedString(root, ["Inlay", "extra"]),
    findNestedString(root, ["inlay", "extra"]),
  ];
  return unique(values.filter(Boolean));
}

/**
 * Loads host context sources faithfully for V3.7.6 pipeline:
 * - Always forces fastMode: false so legacy fastMode cannot steer the source pipeline
 * - Avoids legacy visual heuristics (e.g. SCENE_VISUAL_PATTERN filtering) or premature truncation
 * - CustomInst (config.customParserInstructions) is always used if non-empty
 * - userInstructionsEnabled controls loading extra instruction metadata from persona/character/chat
 * - includeUserInfo / includeCharacterInfo / includeLorebook control corresponding sections
 */
export async function loadV376HostSources(params: {
  chatId: string;
  targetText: string;
  config: Config;
  userId?: string;
}): Promise<V376LoadedHostSources> {
  const { chatId, targetText, config, userId } = params;

  const overrides: string[] = [];

  // Lua toggle_Card.CustomInst is always used if non-empty
  if (config.customParserInstructions?.trim()) {
    overrides.push(config.customParserInstructions.trim());
  }

  if (typeof spindle === "undefined") {
    return {
      customOverride: overrides.length > 0 ? unique(overrides).join("\n\n") : undefined,
    };
  }

  // Force fastMode: false so legacy fastMode cannot disable chat/persona/lorebook RPCs
  const hostConfig: Config = { ...config, fastMode: false };

  // 1. Load Persona, Chat, Character via context adapter
  let sources: Awaited<ReturnType<typeof loadParserContextSources>> | null = null;
  try {
    sources = await loadParserContextSources(chatId, hostConfig, userId);
  } catch {
    sources = null;
  }

  let userName: string | undefined;
  let charName: string | undefined;
  let userInfo: string | undefined;
  let charInfo: string | undefined;

  if (sources?.persona) {
    const p = sources.persona;
    userName = cleanString(p.name) || undefined;
    if (config.includeUserInfo) {
      const lines = [
        namedField("Name", p.name),
        namedField("Title", p.title),
        namedField("Description", p.description),
      ].filter(Boolean);
      if (lines.length > 0) {
        userInfo = lines.join("\n");
      }
    }
    // userInstructionsEnabled loads extra instruction metadata from persona
    if (config.userInstructionsEnabled) {
      overrides.push(...collectExtraInstructionStrings(p.metadata));
    }
  }

  if (sources?.character) {
    const c = sources.character;
    charName = cleanString(c.name) || undefined;
    if (config.includeCharacterInfo) {
      const lines = [
        namedField("Name", c.name),
        namedField("Description", c.description),
        namedField("Personality", c.personality),
        namedField("Scenario", c.scenario),
        namedField("Creator notes", c.creator_notes),
        namedField("System prompt", c.system_prompt),
        namedField("Post-history instructions", c.post_history_instructions),
        Array.isArray(c.tags) && c.tags.length ? `Tags: ${c.tags.join(", ")}` : "",
      ].filter(Boolean);
      if (lines.length > 0) {
        charInfo = lines.join("\n");
      }
    }
    // userInstructionsEnabled loads extra instruction metadata from character
    if (config.userInstructionsEnabled) {
      overrides.push(...collectExtraInstructionStrings(c.extensions));
    }
  }

  // userInstructionsEnabled loads extra instruction metadata from chat
  if (sources?.chat && config.userInstructionsEnabled) {
    overrides.push(...collectExtraInstructionStrings(sources.chat.metadata));
  }

  const customOverride = overrides.length > 0 ? unique(overrides).join("\n\n") : undefined;

  // 2. Load Lorebooks if enabled (without legacy visual keyword truncation)
  const lorebooks: Array<{ content: string; title?: string }> = [];
  if (config.includeLorebook && typeof spindle?.world_books?.getActivated === "function") {
    try {
      const activated = await spindle.world_books.getActivated(chatId, userId);
      if (Array.isArray(activated)) {
        for (const entry of activated) {
          try {
            let content = "";
            let title = cleanString(entry.comment) || undefined;
            if (typeof spindle.world_books.entries?.get === "function") {
              const full = await spindle.world_books.entries.get(entry.id, userId);
              content = cleanString(full?.content);
              if (!title && full?.comment) {
                title = cleanString(full.comment) || undefined;
              }
            }
            if (!content && entry.keys && entry.keys.length > 0) {
              content = `Keys: ${entry.keys.join(", ")}`;
            }
            if (content) {
              // Optionally resolve macros in content if spindle supports it
              if (typeof spindle.macros?.resolve === "function") {
                try {
                  const resolved = await spindle.macros.resolve(content, { chatId, userId } as any);
                  if (typeof resolved === "string") {
                    content = resolved;
                  } else if (resolved && typeof (resolved as unknown as Record<string, unknown>).text === "string") {
                    content = (resolved as unknown as Record<string, unknown>).text as string;
                  }
                } catch {
                  // Keep raw content on macro resolve failure
                }
              }
              lorebooks.push({ content, title });
            }
          } catch {
            // Continue loading remaining entries on single entry error
          }
        }
      }
    } catch {
      // Lorebook loading failed, continue without lorebooks
    }
  }

  return {
    userName,
    charName,
    userInfo,
    charInfo,
    lorebooks,
    customOverride,
  };
}
