export const DEFAULT_QUOTE_EXAMPLE = "저 별들이 보이시나요?\n우리가 함께 걸어온 발자취랍니다.";

export type QuoteSettings = { quoteStyle: string; quoteExample: string };

const byChat = new Map<string, QuoteSettings>();

export function applyQuoteSettingsSnapshot(chatId: string, quoteStyle: unknown, quoteExample: unknown): void {
  if (!chatId) return;
  byChat.set(chatId, {
    quoteStyle: typeof quoteStyle === "string" && quoteStyle !== "null" ? quoteStyle : "",
    quoteExample: typeof quoteExample === "string" && quoteExample !== "null" ? quoteExample : ""
  });
}

export function getQuoteSettings(chatId: string): QuoteSettings {
  return byChat.get(chatId) || { quoteStyle: "", quoteExample: "" };
}

export function splitOriginalQuoteCss(source: string): { globalCss: string; inlineStyle: string } {
  let customStyle = source === "null" ? "" : source;
  const global: string[] = [];
  customStyle = customStyle.replace(/@import[^\r\n]+/g, (match) => {
    global.push(match);
    return "";
  });
  const fontFacePattern = /@font-face\s*\{/g;
  let rebuilt = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = fontFacePattern.exec(customStyle)) !== null) {
    const open = customStyle.indexOf("{", match.index);
    let depth = 0;
    let close = -1;
    for (let i = open; i < customStyle.length; i += 1) {
      if (customStyle[i] === "{") depth += 1;
      else if (customStyle[i] === "}") {
        depth -= 1;
        if (depth === 0) { close = i; break; }
      }
    }
    if (close < 0) break;
    rebuilt += customStyle.slice(cursor, match.index);
    global.push(customStyle.slice(match.index, close + 1));
    cursor = close + 1;
    fontFacePattern.lastIndex = close + 1;
  }
  customStyle = rebuilt + customStyle.slice(cursor);
  return {
    globalCss: global.join(" ").replace(/[\r\n]/g, " "),
    inlineStyle: customStyle.replace(/[\r\n]/g, " ").replace(/"/g, "'")
  };
}
