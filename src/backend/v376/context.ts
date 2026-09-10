/**
 * V3.7.6 Context Construction, Message Scoping, and Encoding Transport.
 * Faithfully ports Lua buildChatDataFunc, buildBaseSharedChatData,
 * collectRecentCharMessages, getImmediateUserMessage, executePreprocessing,
 * and reversible encodings (placeholder, Base64, Atbash, XML prefill).
 */

import {
  PLACEHOLDER_KEYS,
  PLACEHOLDER_MAP,
  SOURCE_ATBASH_PROTOCOL,
  SOURCE_BASE64_PROTOCOL,
  SOURCE_PREFILL_TEMPLATE,
  SOURCE_SYSTEM_PROMPT,
} from "./data.js";
import {
  buildV376CoreInstruction,
  buildV376FormatInstruction,
  buildV376ImageInstruction,
  buildV376Instruction,
  buildV376PreprocessInstruction,
} from "./instructions.js";
import {
  V376EncodingMode,
  V376Options,
  V376PrefillMessage,
} from "./types.js";
import type { PreparedParagraph } from "../types.js";

// ============================================================================
// Encodings & Ciphers (Placeholder, Base64, Atbash)
// ============================================================================

/**
 * Atbash cipher: reverses alphabetic characters (A<->Z, a<->z).
 * Involutory (self-inverting): encode and decode are identical.
 */
export function atbashCipher(str: string): string {
  if (!str) return "";
  const result: string[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      result.push(String.fromCharCode(155 - code));
    } else if (code >= 97 && code <= 122) {
      result.push(String.fromCharCode(219 - code));
    } else {
      result.push(str[i]);
    }
  }
  return result.join("");
}

/**
 * Resolves placeholder tokens (BP1-BP10, SE1-SE20) to plain English words.
 */
export function decodePlaceholders(text: string): string {
  if (!text) return "";
  let result = text;
  for (const key of PLACEHOLDER_KEYS) {
    const replacement = PLACEHOLDER_MAP[key];
    if (replacement && result.includes(key)) {
      result = result.split(key).join(replacement);
    }
  }
  return result;
}

export function base64Encode(str: string): string {
  if (!str) return "";
  return Buffer.from(str, "utf-8").toString("base64");
}

export function base64Decode(str: string): string {
  if (!str) return "";
  const cleaned = str.replace(/\s+/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
  return Buffer.from(cleaned, "base64").toString("utf-8");
}

export function looksLikeCardPayloadText(str: string): boolean {
  if (!str) return false;
  return (
    str.includes('"scenes"') ||
    str.includes('"shots"') ||
    str.includes('"paragraph"') ||
    str.includes('"camera"') ||
    str.includes('"characters"') ||
    str.includes('"positive"') ||
    str.includes('"scene"') ||
    str.includes('"action"')
  );
}

export function hasClearlyInvalidTextBytes(str: string): boolean {
  if (!str) return false;
  if (str.includes("")) return true;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      return true;
    }
  }
  return false;
}

export function tryDecodeBase64Text(str: string): string | null {
  if (!str) return null;
  let compact = str.replace(/\s+/g, "");
  if (!compact || /[^A-Za-z0-9+/=]/.test(compact)) {
    return null;
  }
  const remainder = compact.length % 4;
  if (remainder === 1) {
    return null;
  } else if (remainder > 0) {
    compact += "=".repeat(4 - remainder);
  }
  try {
    const decoded = base64Decode(compact);
    if (looksLikeCardPayloadText(decoded)) {
      return decoded;
    }
    if (hasClearlyInvalidTextBytes(decoded)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function isBase64OnlyLine(line: string): boolean {
  const trimmed = (line || "").trim();
  return trimmed !== "" && /^[A-Za-z0-9+/=]+$/.test(trimmed);
}

export function looksLikeStructuredToon(line: string): boolean {
  return (
    line.includes('"scenes"') ||
    line.includes('"paragraph"') ||
    line.includes('"camera"') ||
    line.includes('"characters"') ||
    line.includes('"positive"') ||
    line.includes('"scene"') ||
    line.includes('"action"') ||
    line.includes("{")
  );
}

/**
 * Decodes a response that was encoded with Base64.
 * Handles mixed prefix lines and structured suffixes as in Lua decodeBase64Response.
 */
export function decodeBase64Response(str: string): string {
  const raw = str || "";
  if (!raw) return "";

  const lines = raw.split(/\r?\n/);
  const prefixLines: string[] = [];
  const suffixLines: string[] = [];
  let sawStructured = false;

  for (const line of lines) {
    if (!sawStructured && isBase64OnlyLine(line)) {
      prefixLines.push(line.trim());
    } else {
      sawStructured = sawStructured || looksLikeStructuredToon(line);
      suffixLines.push(line);
    }
  }

  if (sawStructured && prefixLines.length > 0) {
    const decodedPrefix = tryDecodeBase64Text(prefixLines.join(""));
    if (decodedPrefix) {
      return decodedPrefix + "\n" + suffixLines.join("\n");
    }
    return raw;
  }

  const decoded = tryDecodeBase64Text(raw);
  return decoded ?? raw;
}

/**
 * Encodes an outbound prompt string based on the active encoding method.
 */
export function encodePrompt(str: string, mode?: V376EncodingMode): string {
  if (!str) return "";
  let result = str;

  // If NOT placeholder mode, resolve placeholders to explicit text
  if (mode !== "placeholder") {
    result = decodePlaceholders(result);
  }

  if (mode === "atbash") {
    return atbashCipher(result);
  }
  if (mode === "base64") {
    return base64Encode(result);
  }
  return result;
}

/**
 * Decodes an inbound LLM response string based on the active encoding method.
 */
export function decodeResponse(str: string, mode?: V376EncodingMode): string {
  if (!str) return "";
  if (mode === "atbash") {
    return atbashCipher(str);
  }
  if (mode === "base64") {
    return decodeBase64Response(str);
  }
  return str;
}

// ============================================================================
// Runtime Macro Substitution (no undefined leaks)
// ============================================================================

export interface RuntimeMacroVars {
  userName?: string;
  charName?: string;
  originalCreationName?: string;
}

/**
 * Safely replaces runtime macros ({{user}}, {{char}}, {{original}})
 * without leaking raw macro tokens or the string "undefined".
 */
export function replaceRuntimeMacros(text: string, vars?: RuntimeMacroVars): string {
  if (!text) return "";
  const safeUser = (vars?.userName || "User").trim() || "User";
  const safeChar = (vars?.charName || "Character").trim() || "Character";
  const safeOriginal = (vars?.originalCreationName || "").trim();

  let result = text;

  // Replace {{user}} / {{User}} / {{USER}}
  result = result.replace(/\{\{\s*user\s*\}\}/gi, safeUser);

  // Replace {{char}} / {{Char}} / {{CHAR}}
  result = result.replace(/\{\{\s*char\s*\}\}/gi, safeChar);

  // Replace original name macros
  result = result.replace(
    /\{\{\s*(?:original|originalCreationName|getglobalvar::toggle_Card\.Original\.Text|text_Card\.Original\.Text)\s*\}\}/gi,
    safeOriginal
  );

  // Strip any accidental {{undefined}} or empty unresolved macros
  result = result.replace(/\{\{\s*undefined\s*\}\}/gi, "");

  return result;
}

// ============================================================================
// Prefill XML Parser
// ============================================================================

/**
 * Parses XML-like prefill blocks (<human>...</human>, <assistant>...</assistant>, etc.)
 * into typed chat messages. Supports case-insensitive matching and unclosed tags.
 */
export function parsePrefillToMessages(text: string): V376PrefillMessage[] {
  if (!text) return [];
  const msgs: V376PrefillMessage[] = [];
  const tagRegex = /<([a-zA-Z0-9_]+)([^>]*)>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(text)) !== null) {
    const endPos = tagRegex.lastIndex;
    const tag = match[1];
    const attrsStr = match[2] || "";

    const lowerTag = tag.toLowerCase();
    let role: "char" | "user" | "system" | null = null;
    if (lowerTag === "assistant" || lowerTag === "char") {
      role = "char";
    } else if (lowerTag === "user" || lowerTag === "human" || lowerTag === "usr") {
      role = "user";
    } else if (lowerTag === "system" || lowerTag === "sys") {
      role = "system";
    }

    if (!role) {
      // Skip unknown tags like <thoughts>
      continue;
    }

    // Case-insensitive closing tag search allowing optional whitespace inside tag
    const closeRegex = new RegExp(`</\\s*${tag}\\s*>`, "i");
    const remaining = text.substring(endPos);
    const closeMatch = remaining.match(closeRegex);

    let content = "";
    let closeFound = false;

    if (closeMatch && closeMatch.index !== undefined) {
      const closeIndex = endPos + closeMatch.index;
      content = text.substring(endPos, closeIndex).trim();
      tagRegex.lastIndex = closeIndex + closeMatch[0].length;
      closeFound = true;
    } else {
      // Unclosed tag (e.g. forcing model to begin with JSON)
      content = text.substring(endPos).trim();
      tagRegex.lastIndex = text.length;
      closeFound = false;
    }

    const msg: V376PrefillMessage = { role, content };

    // Parse attributes like id="XYZ"
    const attrRegex = /([\w_]+)="([^"]+)"/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
      msg[attrMatch[1]] = attrMatch[2];
    }

    msgs.push(msg);

    if (!closeFound) {
      break;
    }
  }

  // Fallback if no tags were matched but non-whitespace text exists
  if (msgs.length === 0 && text.trim().length > 0) {
    msgs.push({ role: "char", content: text.trim() });
  }

  return msgs;
}

// ============================================================================
// Message Scoping & Preceding User Pairing
// ============================================================================

export interface V376ChatMessage {
  id?: string;
  role: string;
  content?: string;
  data?: string;
  [key: string]: unknown;
}

export function getMessageText(entry?: V376ChatMessage): string {
  if (!entry) return "";
  if (typeof entry.data === "string" && entry.data.trim()) return entry.data.trim();
  if (typeof entry.content === "string" && entry.content.trim()) return entry.content.trim();
  return "";
}

export function isCharRole(role: string): boolean {
  const lower = role.toLowerCase();
  return lower === "char" || lower === "assistant" || lower === "model" || lower === "bot";
}

export function isUserRole(role: string): boolean {
  const lower = role.toLowerCase();
  return lower === "user" || lower === "human";
}

/**
 * Finds the immediate preceding user message before targetIndex.
 * Stops immediately if another character message is encountered first.
 * Strictly ignores messages at or after targetIndex (no future leakage).
 */
export function getImmediateUserMessage(
  messages: V376ChatMessage[],
  targetIndex: number
): string {
  if (!messages || targetIndex <= 0) return "";
  const lastIndex = Math.min(targetIndex, messages.length);

  for (let j = lastIndex - 1; j >= 0; j--) {
    const entry = messages[j];
    if (!entry) continue;
    if (isUserRole(entry.role)) {
      return getMessageText(entry);
    }
    if (isCharRole(entry.role)) {
      break;
    }
  }
  return "";
}

/**
 * Collects recent character messages up to includeCount, ordered from most recent to older.
 * If includeUser is true, pairs each character message with its immediate preceding user message.
 * Strictly stops before targetIndex and never inspects messages at or after targetIndex.
 */
export function collectRecentCharMessages(
  messages: V376ChatMessage[],
  targetIndex: number,
  includeCount: number,
  includeUser: boolean
): string[] {
  const result: string[] = [];
  const targetCount = Math.max(0, includeCount);
  const lastIndex = Math.min(targetIndex, messages.length);

  if (targetCount === 0 || lastIndex <= 0) return result;

  for (let index = lastIndex - 1; index >= 0; index--) {
    const entry = messages[index];
    if (entry && isCharRole(entry.role)) {
      const charText = getMessageText(entry);
      if (charText) {
        let combinedText = charText;
        if (includeUser) {
          let userText = "";
          for (let j = index - 1; j >= 0; j--) {
            const prev = messages[j];
            if (!prev) continue;
            if (isUserRole(prev.role)) {
              userText = getMessageText(prev);
              break;
            }
            if (isCharRole(prev.role)) {
              break; // stop if we hit another char message first
            }
          }
          if (userText) {
            combinedText = `User: ${userText}\nChar: ${charText}`;
          }
        }
        result.push(combinedText);
        if (result.length >= targetCount) break;
      }
    }
  }

  return result;
}

/**
 * Builds the numbered paragraph text block matching Lua buildNumberedText:
 * [P1] paragraph 1 text
 *
 * [P2] paragraph 2 text
 */
export function buildNumberedText(paragraphs: PreparedParagraph[] | string[]): string {
  if (!paragraphs || paragraphs.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (typeof p === "string") {
      parts.push(`[P${i + 1}] ${p.trim()}`);
    } else {
      parts.push(`[P${p.parserIndex}] ${p.text.trim()}`);
    }
  }
  return parts.join("\n\n");
}

// ============================================================================
// Context Builders (Main Generation & Preprocessing)
// ============================================================================

export interface BuildV376ContextParams {
  targetMessageText: string;
  paragraphs: PreparedParagraph[];
  messages: V376ChatMessage[];
  targetIndex: number;
  options: V376Options;
  includeCount: number;
  includeUserChat?: boolean;
  appearanceReference?: string | null;
  preprocessedText?: string;
  customOverride?: string;
  userInfo?: string;
  charInfo?: string;
  userName?: string;
  charName?: string;
  lorebooks?: Array<{ data?: string; content?: string }>;
  prefillTemplate?: string;
}

export interface BuildV376PreprocessParams {
  paragraphs: PreparedParagraph[] | string[];
  messages: V376ChatMessage[];
  targetIndex: number;
  options: V376Options;
  includeCount: number;
  includeUserChat?: boolean;
  appearanceReference?: string | null;
  userInfo?: string;
  charInfo?: string;
  userName?: string;
  charName?: string;
  lorebooks?: Array<{ data?: string; content?: string }>;
  prefillTemplate?: string;
  preprocessPromptTemplate?: string;
}

export interface V376OutboundMessage {
  role: "system" | "user" | "assistant" | "char";
  content: string;
  [key: string]: unknown;
}

/**
 * Builds preprocessing context matching Lua executePreprocessing.
 * Strictly scopes messages before targetIndex (no future leakage) and pairs
 * user messages when includeUserChat is enabled.
 */
export function buildV376PreprocessContext(
  params: BuildV376PreprocessParams
): V376OutboundMessage[] {
  const {
    paragraphs,
    messages,
    targetIndex,
    options,
    includeCount,
    includeUserChat = false,
    appearanceReference,
    userInfo,
    charInfo,
    userName,
    charName,
    lorebooks,
    prefillTemplate,
    preprocessPromptTemplate,
  } = params;

  const enc = options.encodingMode ?? "plain";
  const macroVars: RuntimeMacroVars = {
    userName: userName || (typeof options.userName === "string" ? options.userName : undefined),
    charName: charName || (typeof options.charName === "string" ? options.charName : undefined),
    originalCreationName: options.originalCreationName,
  };
  const chatData: V376OutboundMessage[] = [];

  // 1. Base Shared Data (Initial plaintext system header is ALWAYS SOURCE_SYSTEM_PROMPT in all modes per Lua)
  chatData.push({ role: "system", content: SOURCE_SYSTEM_PROMPT });

  if (userInfo && userInfo.trim()) {
    const renderedUserInfo = replaceRuntimeMacros(userInfo.trim(), macroVars);
    chatData.push({
      role: "system",
      content: encodePrompt(`## ${macroVars.userName || "User"} Info\n${renderedUserInfo}`, enc),
    });
  }

  if (charInfo && charInfo.trim()) {
    const renderedCharInfo = replaceRuntimeMacros(charInfo.trim(), macroVars);
    chatData.push({
      role: "system",
      content: encodePrompt(`## ${macroVars.charName || "Character"} Info\n${renderedCharInfo}`, enc),
    });
  }

  if (lorebooks && lorebooks.length > 0) {
    for (const book of lorebooks) {
      const text = (book.data || book.content || "").trim();
      if (text) {
        chatData.push({
          role: "system",
          content: encodePrompt(replaceRuntimeMacros(text, macroVars), enc),
        });
      }
    }
  }

  // 2. Chat history strictly prior to targetIndex
  if (includeCount > 0) {
    const recentMessages = collectRecentCharMessages(
      messages,
      targetIndex,
      includeCount,
      includeUserChat
    );
    if (recentMessages.length > 0) {
      const historyTitle = includeUserChat
        ? "## Previous Chat Context"
        : "## Previous Character Messages";
      const historyParts = [historyTitle, "- Ordered from most recent to older."];
      for (let i = 0; i < recentMessages.length; i++) {
        historyParts.push(`[History ${i + 1}]\n${replaceRuntimeMacros(recentMessages[i], macroVars)}`);
      }
      chatData.push({
        role: "system",
        content: encodePrompt(historyParts.join("\n\n"), enc),
      });
    }
  }

  // 3. Immediate user message strictly prior to targetIndex
  if (includeUserChat) {
    const immediateUserMsg = getImmediateUserMessage(messages, targetIndex);
    if (immediateUserMsg) {
      chatData.push({
        role: "system",
        content: encodePrompt(`## Previous User Message\n${replaceRuntimeMacros(immediateUserMsg, macroVars)}`, enc),
      });
    }
  }

  // 4. Combined prep parts: Appearance reference + Format instructions
  const combinedPrepParts: string[] = [];
  if (appearanceReference && appearanceReference.trim()) {
    combinedPrepParts.push(replaceRuntimeMacros(appearanceReference.trim(), macroVars));
  }

  const formatInstruction = buildV376FormatInstruction(options);
  if (formatInstruction && formatInstruction.trim()) {
    combinedPrepParts.push(replaceRuntimeMacros(formatInstruction.trim(), macroVars));
  }

  if (combinedPrepParts.length > 0) {
    chatData.push({
      role: "system",
      content: encodePrompt(combinedPrepParts.join("\n\n"), enc),
    });
  }

  // 5. Preprocess user input
  const rawPreprocessPrompt = preprocessPromptTemplate || buildV376PreprocessInstruction(options);
  const preprocessInstruction = replaceRuntimeMacros(rawPreprocessPrompt, macroVars);
  const numberedText = buildNumberedText(paragraphs);
  const preprocessInput = `${preprocessInstruction}\n\n${numberedText}`;

  chatData.push({
    role: "user",
    content: encodePrompt(preprocessInput, enc),
  });

  // 6. Prefill messages appended at the absolute end
  if (options.prefillEnabled) {
    const rawTemplate = prefillTemplate || SOURCE_PREFILL_TEMPLATE;
    const renderedTemplate = replaceRuntimeMacros(rawTemplate, macroVars);
    const prefillMsgs = parsePrefillToMessages(renderedTemplate);
    for (const pm of prefillMsgs) {
      const encodedMsg: V376OutboundMessage = {
        role: pm.role,
        content: encodePrompt(pm.content, enc),
      };
      for (const [k, v] of Object.entries(pm)) {
        if (k !== "role" && k !== "content") {
          encodedMsg[k] = v;
        }
      }
      chatData.push(encodedMsg);
    }
  }

  return chatData;
}

/**
 * Builds the complete chat messages payload to send to the LLM.
 * Faithfully mirrors Lua buildChatDataFunc and buildBaseSharedChatData.
 */
export function buildV376Context(params: BuildV376ContextParams): V376OutboundMessage[] {
  const {
    paragraphs,
    messages,
    targetIndex,
    options,
    includeCount,
    includeUserChat = false,
    appearanceReference,
    preprocessedText,
    customOverride,
    userInfo,
    charInfo,
    userName,
    charName,
    lorebooks,
    prefillTemplate,
  } = params;

  const enc = options.encodingMode ?? "plain";
  const macroVars: RuntimeMacroVars = {
    userName: userName || (typeof options.userName === "string" ? options.userName : undefined),
    charName: charName || (typeof options.charName === "string" ? options.charName : undefined),
    originalCreationName: options.originalCreationName,
  };
  const chatData: V376OutboundMessage[] = [];

  // 1. Base Shared Data (Initial plaintext system header is ALWAYS SOURCE_SYSTEM_PROMPT in all modes per Lua)
  chatData.push({ role: "system", content: SOURCE_SYSTEM_PROMPT });

  // Optional User Info (no {{user}} macro leak)
  if (userInfo && userInfo.trim()) {
    const renderedUserInfo = replaceRuntimeMacros(userInfo.trim(), macroVars);
    chatData.push({
      role: "system",
      content: encodePrompt(`## ${macroVars.userName || "User"} Info\n${renderedUserInfo}`, enc),
    });
  }

  // Optional Char Info (no {{char}} macro leak)
  if (charInfo && charInfo.trim()) {
    const renderedCharInfo = replaceRuntimeMacros(charInfo.trim(), macroVars);
    chatData.push({
      role: "system",
      content: encodePrompt(`## ${macroVars.charName || "Character"} Info\n${renderedCharInfo}`, enc),
    });
  }

  // Optional Lorebook entries
  if (lorebooks && lorebooks.length > 0) {
    for (const book of lorebooks) {
      const text = (book.data || book.content || "").trim();
      if (text) {
        chatData.push({
          role: "system",
          content: encodePrompt(replaceRuntimeMacros(text, macroVars), enc),
        });
      }
    }
  }

  // 2. Chat history strictly prior to targetIndex
  if (includeCount > 0) {
    const recentMessages = collectRecentCharMessages(
      messages,
      targetIndex,
      includeCount,
      includeUserChat
    );
    if (recentMessages.length > 0) {
      const historyTitle = includeUserChat
        ? "## Previous Chat Context"
        : "## Previous Character Messages";
      const historyParts = [
        historyTitle,
        "- Ordered from most recent to older.",
        "- Use them only as supporting context. The current message remains the primary source for the current scene.",
      ];
      for (let i = 0; i < recentMessages.length; i++) {
        historyParts.push(`[History ${i + 1}]\n${replaceRuntimeMacros(recentMessages[i], macroVars)}`);
      }
      chatData.push({
        role: "system",
        content: encodePrompt(historyParts.join("\n\n"), enc),
      });
    }
  }

  // 3. Immediate user message strictly prior to targetIndex
  if (includeUserChat) {
    const immediateUserMsg = getImmediateUserMessage(messages, targetIndex);
    if (immediateUserMsg) {
      chatData.push({
        role: "system",
        content: encodePrompt(`## Previous User Message\n${replaceRuntimeMacros(immediateUserMsg, macroVars)}`, enc),
      });
    }
  }

  // 4. Core prompt (Card.Core.axLLM protocol instructions for base64/atbash; omit if empty to avoid empty system messages)
  const corePrompt = replaceRuntimeMacros(buildV376CoreInstruction(options), macroVars);
  if (corePrompt && corePrompt.trim()) {
    chatData.push({
      role: "system",
      content: encodePrompt(corePrompt.trim(), enc),
    });
  }

  // 5. Combined system parts: Image instructions, Character Appearance, Format
  const combinedSystemParts: string[] = [];
  const imageInstruction = buildV376ImageInstruction(options);
  if (imageInstruction && imageInstruction.trim()) {
    combinedSystemParts.push(replaceRuntimeMacros(imageInstruction.trim(), macroVars));
  }

  if (appearanceReference && appearanceReference.trim()) {
    combinedSystemParts.push(replaceRuntimeMacros(appearanceReference.trim(), macroVars));
  }

  const formatInstruction = buildV376FormatInstruction(options);
  if (formatInstruction && formatInstruction.trim()) {
    combinedSystemParts.push(replaceRuntimeMacros(formatInstruction.trim(), macroVars));
  }

  if (combinedSystemParts.length > 0) {
    chatData.push({
      role: "system",
      content: encodePrompt(combinedSystemParts.join("\n\n"), enc),
    });
  }

  // 6. User input with paragraph numbering & constraints
  const imageMin = Math.max(1, options.imageMin ?? 3);
  const imageMax = Math.max(imageMin, options.imageMax ?? 5);

  let constraints = "\n\n## Constraints\n";
  constraints += `- Generate between ${imageMin} to ${imageMax} shots total across all scenes.\n`;
  if (options.mode === "asset") {
    constraints += "- Each shot must contain exactly 1 character (asset mode).\n";
  }
  if (options.mode === "comic") {
    constraints +=
      "- Panel numbering MUST RESET for every new shot. The first panel of EVERY shot must be number 1, the second is 2, etc. Do NOT continue panel numbers from previous shots.\n";
  }
  if (options.quote) {
    const customQuote = (
      typeof options.quoteInstruction === "string"
        ? options.quoteInstruction
        : typeof options.quoteInst === "string"
        ? options.quoteInst
        : ""
    ).trim();
    if (customQuote && customQuote.toLowerCase() !== "null") {
      constraints += `\n## Quote\n${customQuote}\n`;
    } else {
      constraints +=
        `\n## Quote\n- In the "quote" field, include a single line in each shot capturing a short, relevant single line of dialogue or thought from that shot.\n- It must be from the characters' in the shot.\n`;
    }
  }

  const numberedText = buildNumberedText(paragraphs);
  let userInput = "";

  if (preprocessedText && preprocessedText.trim()) {
    userInput =
      `Analyze the following preprocessed paragraph summaries and generate Image Prompts. Output ONLY one JSON object with a top-level "scenes" array. Group shots by location: if no location change, use one scene with multiple shots; if a location change occurs, start a new scene.` +
      constraints +
      `\n\n## Preprocessed Analysis\n${preprocessedText.trim()}`;
  } else {
    userInput =
      `Analyze the following numbered paragraphs and generate Image Prompts.\nThe current numbered paragraphs are authoritative for the character's present visual state. Use earlier context only for missing stable identity traits.\nDO NOT reproduce the original text. Output ONLY one JSON object with a top-level "scenes" array. Group shots by location: if no location change, use one scene with multiple shots; if a location change occurs, start a new scene.\n\nParagraph mapping: current message uses \`[P#]\` numbering.\n- Each shot's \`paragraph\` must reference an existing \`[P#]\`.\n- Never invent paragraph numbers outside the visible range.\n- Tag ONLY the current message.\n- Select dialogues, monologues or descriptions and spread the shots evenly among the current message.` +
      constraints +
      `\n\n## Current Message\n${numberedText}`;
  }

  userInput = replaceRuntimeMacros(userInput, macroVars);

  chatData.push({
    role: "user",
    content: encodePrompt(userInput, enc),
  });

  // 7. Custom override prompt (priority: instructions override)
  if (customOverride && customOverride.trim()) {
    const overrideText =
      `# Priority: Instructions Override\n${customOverride.trim()}\n> These are instructions explicitly given by the Client. If in conflict with previous instructions, this section MUST take precedence.`;
    chatData.push({
      role: "user",
      content: encodePrompt(replaceRuntimeMacros(overrideText, macroVars), enc),
    });
  }

  // 8. Prefill messages appended at the absolute end
  if (options.prefillEnabled) {
    const rawTemplate = prefillTemplate || SOURCE_PREFILL_TEMPLATE;
    const renderedTemplate = replaceRuntimeMacros(rawTemplate, macroVars);
    const prefillMsgs = parsePrefillToMessages(renderedTemplate);
    for (const pm of prefillMsgs) {
      const encodedMsg: V376OutboundMessage = {
        role: pm.role,
        content: encodePrompt(pm.content, enc),
      };
      for (const [k, v] of Object.entries(pm)) {
        if (k !== "role" && k !== "content") {
          encodedMsg[k] = v;
        }
      }
      chatData.push(encodedMsg);
    }
  }

  return chatData;
}
