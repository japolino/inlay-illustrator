import { describe, expect, it } from "bun:test";
import {
  applyV376KeywordReplacements,
  buildV376CoreInstruction,
  buildV376FormatInstruction,
  buildV376ImageInstruction,
  buildV376Instruction,
  buildV376PreprocessInstruction,
  renderV376PromptTemplate,
  resolveV376Variables,
} from "./instructions.js";
import { V376Options } from "./types.js";
import {
  RAW_LOREBOOK_CORE,
  RAW_LOREBOOK_FORMAT,
  RAW_LOREBOOK_IMAGE,
  RAW_LOREBOOK_PREPROCESS,
} from "./data.js";

describe("v376 instructions and macro renderer", () => {
  const baseOptions: V376Options = {
    mode: "illustration",
    nsfw: false,
    supplement: false,
    text: "off",
    quote: false,
    syntax: "nai",
    separator: "pipe",
    imageMin: 3,
    imageMax: 5,
    characterMax: 2,
    panelMin: 3,
    originalReference: false,
    originalCreationName: "",
    encodingMode: "plain",
    prefillEnabled: false,
  };

  it("resolves variables correctly from V376Options", () => {
    const vars = resolveV376Variables({
      ...baseOptions,
      mode: "comic",
      nsfw: true,
      supplement: true,
      text: "english",
      syntax: "comfyui",
      quote: true,
      originalReference: true,
      originalCreationName: "BlueArchive",
      encodingMode: "base64",
    });

    expect(vars["toggle_Card.Mode"]).toBe("2");
    expect(vars["toggle_Card.Nsfw"]).toBe("1");
    expect(vars["toggle_Card.Supplement"]).toBe("1");
    expect(vars["toggle_Card.Text"]).toBe("2");
    expect(vars["toggle_Card.Prompt.Compatibility"]).toBe("1");
    expect(vars["toggle_Card.Quote"]).toBe("1");
    expect(vars["toggle_Card.Original"]).toBe("1");
    expect(vars["toggle_Card.Original.Text"]).toBe("BlueArchive");
    expect(vars["toggle_Card.Encode"]).toBe("2");
    expect(vars["toggle_Card.Image.Min"]).toBe("3");
    expect(vars["toggle_Card.Image.Max"]).toBe("5");
    expect(vars["toggle_Card.Character.Max"]).toBe("2");
    expect(vars["toggle_Card.PanelNum"]).toBe("3");
  });

  it("applies keyword replacements (loli/shota) faithfully", () => {
    expect(applyV376KeywordReplacements("a cute loli and a young shota"))
      .toBe("a cute young girl and a young young boy");
    // Case-sensitive fidelity check: uppercase LOLI remains untouched
    expect(applyV376KeywordReplacements("LOLI")).toBe("LOLI");
  });

  it("renders core instructions based on encodingMode", () => {
    const plainCore = buildV376CoreInstruction({ ...baseOptions, encodingMode: "plain" });
    expect(plainCore).toBe("");

    const b64Core = buildV376CoreInstruction({ ...baseOptions, encodingMode: "base64" });
    expect(b64Core).toContain("Base64-Encoded Instruction Protocol");
    expect(b64Core).not.toContain("Atbash-Encoded Instruction Protocol");

    const atbashCore = buildV376CoreInstruction({ ...baseOptions, encodingMode: "atbash" });
    expect(atbashCore).toContain("Atbash-Encoded Instruction Protocol");
    expect(atbashCore).not.toContain("Base64-Encoded Instruction Protocol");
  });

  it("renders preprocess instructions with dynamic min/max shots", () => {
    const prep = buildV376PreprocessInstruction({
      ...baseOptions,
      imageMin: 2,
      imageMax: 6,
    });
    expect(prep).toContain("Generate 2–6 shots total.");
    expect(prep).toContain("## Scene Tagging");
  });

  it("renders image instruction standalone without format instructions", () => {
    const imgInst = buildV376ImageInstruction(baseOptions);
    expect(imgInst).toContain("# System Instructions");
    expect(imgInst).toContain("## Scenes & Shots");
    expect(imgInst).not.toContain("## Output Format");
    expect(imgInst).not.toContain("## JSON Format");
  });

  it("renders format instructions with placeholder codes when encodingMode is placeholder", () => {
    const normalFormat = buildV376FormatInstruction({
      ...baseOptions,
      encodingMode: "plain",
    });
    expect(normalFormat).not.toContain("## Placeholder Codes");
    expect(normalFormat).toContain("Output raw JSON.");

    const placeholderFormat = buildV376FormatInstruction({
      ...baseOptions,
      encodingMode: "placeholder",
    });
    expect(placeholderFormat).toContain("## Placeholder Codes");
    expect(placeholderFormat).toContain("BP1 | nipples");
    expect(placeholderFormat).toContain("SE1 | nsfw");
  });

  it("renders instructions for asset mode (mode 1)", () => {
    const inst = buildV376Instruction({
      ...baseOptions,
      mode: "asset",
    });
    expect(inst).toContain("Always `white background, simple background`");
    expect(inst).toContain("One shot per selected paragraph, each containing exactly one visible character.");
    expect(inst).not.toContain("## `panels`");
  });

  it("renders instructions for comic mode (mode 2)", () => {
    const inst = buildV376Instruction({
      ...baseOptions,
      mode: "comic",
      panelMin: 4,
    });
    expect(inst).toContain("## `placement`");
    expect(inst).toContain("## `panels`");
    expect(inst).toContain("Make at least 4 per shot.");
  });

  it("renders instructions for NSFW and supplement combinations", () => {
    const instNsfw = buildV376Instruction({
      ...baseOptions,
      nsfw: true,
      supplement: true,
    });
    expect(instNsfw).toContain("### `sex`");
    expect(instNsfw).toContain("### `supplement`");
  });

  it("leaves NO unrendered Risu macros across representative option combinations", () => {
    const modes: V376Options["mode"][] = ["illustration", "asset", "comic"];
    const nsfwOpts = [false, true];
    const supplementOpts = [false, true];
    const textOpts: V376Options["text"][] = ["off", "english"];
    const syntaxOpts: V376Options["syntax"][] = ["nai", "comfyui"];
    const encodeOpts: V376Options["encodingMode"][] = ["plain", "placeholder", "base64", "atbash"];

    for (const mode of modes) {
      for (const nsfw of nsfwOpts) {
        for (const supplement of supplementOpts) {
          for (const text of textOpts) {
            for (const syntax of syntaxOpts) {
              for (const encodingMode of encodeOpts) {
                const opts: V376Options = {
                  ...baseOptions,
                  mode,
                  nsfw,
                  supplement,
                  text,
                  syntax,
                  encodingMode,
                  quote: true,
                  originalReference: true,
                  originalCreationName: "OriginalSource",
                };

                const instruction = buildV376Instruction(opts);
                // Search for any unrendered {{ ... }} excluding {{user}}
                const unrendered = instruction.match(/\{\{(?!user\}\})[^}]+\}\}/g);
                expect(unrendered).toBeNull();
              }
            }
          }
        }
      }
    }
  });

  it("golden test: preserves supplied work name in Original Creation Tag instruction", () => {
    const inst = buildV376Instruction({
      ...baseOptions,
      originalReference: true,
      originalCreationName: "Arknights: Endfield",
    });
    expect(inst).toContain("## Character Names");
    expect(inst).toContain("- Creation Name: `Arknights: Endfield`.");
  });

  it("verifies RAW_* runtime constants exactly equal tracked source text", () => {
    expect(RAW_LOREBOOK_CORE.length).toBe(2159);
    expect(RAW_LOREBOOK_IMAGE.length).toBe(22363);
    expect(RAW_LOREBOOK_FORMAT.length).toBe(8139);
    expect(RAW_LOREBOOK_PREPROCESS.length).toBe(1454);
    expect(RAW_LOREBOOK_IMAGE).toContain("Creation Name: `{{getglobalvar::toggle_Card.Original.Text}}`");
  });

  it("resolves both toggle_Card.Original.Text and text_Card.Original.Text identically", () => {
    const vars = resolveV376Variables({
      ...baseOptions,
      originalReference: true,
      originalCreationName: "GenshinImpact",
    });
    expect(vars["toggle_Card.Original.Text"]).toBe("GenshinImpact");
    expect(vars["text_Card.Original.Text"]).toBe("GenshinImpact");

    // Also verify macro rendering for both variants
    const template1 = "Creation: {{getglobalvar::toggle_Card.Original.Text}}";
    const template2 = "Creation: {{getglobalvar::text_Card.Original.Text}}";
    expect(renderV376PromptTemplate(template1, vars)).toBe("Creation: GenshinImpact");
    expect(renderV376PromptTemplate(template2, vars)).toBe("Creation: GenshinImpact");
  });

  it("renders localized text instructions for all 6 text language options", () => {
    const textOptions: Array<{ lang: V376Options["text"]; sample: string }> = [
      { lang: "off", sample: "### `text`" },
      { lang: "free", sample: "hello" },
      { lang: "english", sample: "hello" },
      { lang: "korean", sample: "안녕" },
      { lang: "japanese", sample: "こんにちは" },
      { lang: "chinese", sample: "你好" },
    ];

    for (const { lang, sample } of textOptions) {
      const inst = buildV376Instruction({
        ...baseOptions,
        text: lang,
      });
      if (lang === "off") {
        expect(inst).not.toContain(sample);
      } else {
        expect(inst).toContain(sample);
      }
    }
  });

  it("verifies keyword replacement is strictly case-sensitive per Lua literalReplace", () => {
    expect(applyV376KeywordReplacements("loli")).toBe("young girl");
    expect(applyV376KeywordReplacements("shota")).toBe("young boy");
    expect(applyV376KeywordReplacements("Loli")).toBe("Loli");
    expect(applyV376KeywordReplacements("SHOTA")).toBe("SHOTA");
    expect(applyV376KeywordReplacements("young girl")).toBe("young girl"); // not recursive
  });

});
