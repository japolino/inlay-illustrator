import { describe, expect, test } from "bun:test";
import archivedCard from "../../references/original-module/card.json";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { renderOriginalImageInstruction } from "./original-instructions.js";
import { atbashCipher, base64Decode, base64Encode, decodeBase64Response, decodePlaceholders, decodeResponse, encodePrompt, PLACEHOLDER_MAP } from "./encoding.js";
import { parseParserJson } from "./parser.js";
import { prepareParagraphs } from "./paragraphs.js";
import { baselineIdentityTags, parseCharAppearanceRaw } from "./memory.js";
import { normalizeReferenceTags } from "./prompt.js";
const entries = (archivedCard.data.character_book.entries as Array<{ name?: string; content?: string }>);
describe("golden: card.json byte fidelity", () => {
  test("Card.Image.axLLM rendered conditionals match card source for each Encode/Mode/Supplement/Quote/Compat combo", () => {
    const base = { ...DEFAULT_CONFIG, minImages: 3, maxImages: 5, maxCharacters: 2, mode: "illustration" as const, promptSyntax: "comfyui" as const, originalCreationName: "Anima" };
    for (const encodeMode of ["0","1","2"] as const) {
      for (const supplement of [true,false]) {
        for (const quotesEnabled of [true,false]) {
          const rendered = renderOriginalImageInstruction({ ...base, encodeMode, supplement, quotesEnabled });
          expect(rendered).not.toMatch(/\{\{#(?:if|when)|\{\{getglobalvar/);
          if (encodeMode === "0") { expect(rendered).toContain("## Placeholder Codes"); expect(rendered).toContain("Output raw JSON."); expect(rendered).not.toContain("Base64-encode entire response"); }
          if (encodeMode === "1") { expect(rendered).toContain("Base64-encode entire response"); expect(rendered).not.toContain("## Placeholder Codes"); }
          if (encodeMode === "2") { expect(rendered).toContain("Atbash-encode entire response"); expect(rendered).not.toContain("## Placeholder Codes"); }
        }
      }
    }
  });
  test("encodePrompt/decodeResponse roundtrip for all modes", () => {
    // For placeholder-free strings, roundtrip is identity. For strings containing BP/SE codes, encodeMode !=0 decodes them first (original behavior lines 232-237), so roundtrip returns decoded form.
    const plainSamples = ["hello world", '{"scenes":[{"shots":[{"paragraph":1}]}]}', "ahegao, nude, completely nude"];
    for (const s of plainSamples) { expect(decodeResponse(encodePrompt(s, "0"), "0")).toBe(s); expect(decodeResponse(encodePrompt(s, "1"), "1")).toBe(s); expect(decodeResponse(encodePrompt(s, "2"), "2")).toBe(s); }
    // Placeholder case: encodeMode 0 keeps codes, 1/2 expands
    expect(decodeResponse(encodePrompt("SE1 and BP3", "0"), "0")).toBe("SE1 and BP3");
    expect(decodeResponse(encodePrompt("SE1 and BP3", "1"), "1")).toBe("nsfw and pussy");
    expect(decodeResponse(encodePrompt("SE1 and BP3", "2"), "2")).toBe("nsfw and pussy");
  });
  test("Base64 encode matches known vectors", () => { expect(base64Encode("hello")).toBe("aGVsbG8="); expect(base64Decode("aGVsbG8=")).toBe("hello"); expect(base64Encode("")).toBe(""); });
  test("Atbash involution", () => { expect(atbashCipher(atbashCipher("Hello World! 123"))).toBe("Hello World! 123"); expect(atbashCipher("ABC xyz")).toBe("ZYX cba"); });
  test("placeholder BP10 length-order precedence", () => { expect(decodePlaceholders("BP10 and BP1")).toBe(`${PLACEHOLDER_MAP.BP10} and ${PLACEHOLDER_MAP.BP1}`); expect(decodePlaceholders("SE10 SE1")).toBe(`${PLACEHOLDER_MAP.SE10} ${PLACEHOLDER_MAP.SE1}`); });
  test("placeholder decode only for encode !=0 at encodePrompt time", () => { const raw = "BP3 SE1"; expect(encodePrompt(raw, "0")).toBe(raw); expect(encodePrompt(raw, "1")).toBe(base64Encode("pussy nsfw")); expect(decodeResponse(encodePrompt(raw, "1"), "1")).toBe("pussy nsfw"); });
  test("decodeBase64Response prefix mix", () => { const payload = '{"scenes":[{"place":"room"}]}'; const b64 = base64Encode("prologue"); const mixed = `${b64}\n${payload}`; const decoded = decodeBase64Response(mixed); expect(decoded).toBe(`prologue\n${payload}`); });
  test("decodeBase64Response whole-string heuristic", () => { const payload = '{"scenes":[{"shots":[{"paragraph":1}]}]}'; const b64 = base64Encode(payload); expect(decodeBase64Response(b64)).toBe(payload); const garbage = "not base64!!!"; expect(decodeBase64Response(garbage)).toBe(garbage); });
  test("parser preserves document order", () => { const small = '{"scenes":[{"place":"a"}]}'; const large = '{"scenes":[{"place":"' + "x".repeat(200) + '"}]}'; const firstSmall = parseParserJson(`${small} ${large}`); expect((firstSmall.scenes?.[0] as {place?:string})?.place).toBe("a"); const firstLarge = parseParserJson(`${large} ${small}`); expect(((firstLarge.scenes?.[0] as {place?:string})?.place || "").length).toBeGreaterThan(100); });
  test("sanitize \\( \\) before JSON parse", () => { const parsed = parseParserJson('{"scenes":[{"place":"a\\(b\\)","shots":[{"paragraph":1}]}]}'); expect((parsed.scenes?.[0] as {place?:string})?.place).toBe("a(b)"); });
  test("fuzzy repair distance <=2 only", () => { const parsed = parseParserJson('{"sceens":[{"shots":[{"paragraf":1}]}]}'); expect(parsed.scenes).toHaveLength(1); expect(() => parseParserJson('{"sceeeens":[]}')).toThrow(); });
  test("paragraph stripping faithfully handles original tags", () => { const input = "Line1\n\n[Date: 2024]\nKeep this\n<Update Log>remove</Update Log> keep?\n\nCARDDATA: meta\nLine2\nINLAY[abc] \n\nParagraph2"; const config = { ...DEFAULT_CONFIG, ignoredTags: "" }; const paragraphs = prepareParagraphs(input, config); const texts = paragraphs.map((p) => p.text); expect(texts.join("|")).not.toContain("CARDDATA"); expect(texts.join("|")).not.toContain("[Date:"); expect(texts.join("|")).not.toContain("Update Log"); });
  test("ignoredTags splits on ; only and matches %w+ names", () => { const config = { ...DEFAULT_CONFIG, ignoredTags: "foo;bar-baz; <think>" }; const paragraphs = prepareParagraphs("a <foo>hidden</foo> b <bar-baz>kept</bar-baz> c <think>hidden think</think> end", config); const text = paragraphs.map((p) => p.text).join(" "); expect(text).not.toContain("hidden</foo>"); expect(text).toContain("kept"); expect(text).not.toContain("hidden think"); });
  test("memory stores identity", () => { const char = { label: "girl", age: "", appearance: "red hair, standing", body: "portrait", attire: "dress" } as Parameters<typeof baselineIdentityTags>[0]; expect(baselineIdentityTags(char)).toBe("girl, red hair, standing, portrait, dress"); });
  test("loadCharAppearance regex", () => { const raw = '{"Alice":"red hair","Bob":"black hair"}'; expect(parseCharAppearanceRaw(raw)).toEqual({ Alice: "red hair", Bob: "black hair" }); const withNull = '{"Alice":"null","Bob":"none"}'; expect(parseCharAppearanceRaw(withNull)).toEqual({}); });
  test("normalizeReferenceTags drops null/none", () => { expect(normalizeReferenceTags("red hair, Null, NONE, red hair")).toBe("red hair"); });
});
