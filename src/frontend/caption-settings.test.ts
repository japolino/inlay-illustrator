import { describe, expect, test } from "bun:test";
import { applyQuoteSettingsSnapshot, getQuoteSettings, splitOriginalQuoteCss } from "./caption-settings.js";

describe("original per-chat caption settings", () => {
  test("extracts @import and @font-face globally and keeps remaining declarations inline", () => {
    const source = '@import url("font.css");\n@font-face { font-family: "Demo"; src: url(demo.woff2); x: { nested }; }\nfont-family: "Demo";\nfont-size: 31px;';
    const parsed = splitOriginalQuoteCss(source);
    expect(parsed.globalCss).toContain('@import url("font.css");');
    expect(parsed.globalCss).toContain('@font-face { font-family: "Demo"; src: url(demo.woff2); x: { nested }; }');
    expect(parsed.globalCss).not.toContain("font-size: 31px");
    expect(parsed.inlineStyle).toContain("font-family: 'Demo';");
    expect(parsed.inlineStyle).toContain("font-size: 31px;");
    expect(parsed.inlineStyle).not.toContain("\n");
  });

  test("preserves independent per-chat values and original null-as-empty behavior", () => {
    applyQuoteSettingsSnapshot("chat-a", "font-size:20px", "A");
    applyQuoteSettingsSnapshot("chat-b", "null", "null");
    expect(getQuoteSettings("chat-a")).toEqual({ quoteStyle: "font-size:20px", quoteExample: "A" });
    expect(getQuoteSettings("chat-b")).toEqual({ quoteStyle: "", quoteExample: "" });
    expect(getQuoteSettings("missing")).toEqual({ quoteStyle: "", quoteExample: "" });
  });
});
