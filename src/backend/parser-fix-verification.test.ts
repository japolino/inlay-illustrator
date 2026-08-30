import { describe, expect, test, mock, beforeEach } from "bun:test";
import archivedCard from "../../references/original-module/card.json";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { renderCoreInstructionSource, renderImageInstructionSource, renderOriginalCoreInstruction, renderOriginalImageInstruction, renderPreprocessInstructionSource } from "./original-instructions.js";
import { ORIGINAL_CORE_INSTRUCTION_SOURCE, ORIGINAL_IMAGE_INSTRUCTION_SOURCE } from "./original-instruction-assets.js";
import { CORE_PREAMBLE } from "./instructions.js";
import { base64Encode, base64Decode, encodePrompt, decodeResponse } from "./encoding.js";
import { buildParserMessages, getPrefillMessages, parsePrefillMessages } from "./parser.js";
import { includeCountForAttempt, formatRecentContext } from "./context.js";
import { assemblePrompt, getFinalPromptsForGeneration, extractLLMPrompts, normalizeCharacterData } from "./prompt.js";
import { updateCache, parseCharAppearanceRaw } from "./memory.js";
import type { ParserContext, PreparedParagraph, SceneJson, ShotJson } from "./types.js";

const entries = (archivedCard.data.character_book.entries as Array<{ name?: string; content?: string }>);
const archived = (name: string): string => entries.find((e) => e.name === name)?.content || "";

describe("fix: Core/Image exact assets", () => {
  test("Core source matches card.json byte for byte", () => {
    expect(ORIGINAL_CORE_INSTRUCTION_SOURCE).toBe(archived("Card.Core.axLLM"));
  });
  test("Image source matches card.json", () => {
    expect(ORIGINAL_IMAGE_INSTRUCTION_SOURCE).toBe(archived("Card.Image.axLLM"));
  });
  test("Core renders Base64 protocol only for encodeMode 1", () => {
    const core1 = renderOriginalCoreInstruction({ ...DEFAULT_CONFIG, encodeMode: "1" });
    expect(core1).toContain("Base64-Encoded Instruction Protocol");
    expect(core1).not.toContain("Atbash-Encoded");
    const core2 = renderOriginalCoreInstruction({ ...DEFAULT_CONFIG, encodeMode: "2" });
    expect(core2).toContain("Atbash-Encoded Instruction Protocol");
    expect(core2).not.toContain("Base64-Encoded");
    const core0 = renderOriginalCoreInstruction({ ...DEFAULT_CONFIG, encodeMode: "0" });
    expect(core0).toBe("");
    const core3 = renderOriginalCoreInstruction({ ...DEFAULT_CONFIG, encodeMode: "3" as any });
    expect(core3).toBe(""); // encodeMode 3 normalized to 0, no Atbash/Base64
  });
  test("runtime instruction sources resolve the same card macros without trimming bytes", () => {
    const core = "  A{{#if_pure {{equal::{{getglobalvar::toggle_Card.Encode}}::1}}}}YES{{/if_pure}}B  ";
    expect(renderCoreInstructionSource(core, { ...DEFAULT_CONFIG, encodeMode: "1" }, false)).toBe("  AYESB  ");
    expect(renderCoreInstructionSource(core, { ...DEFAULT_CONFIG, encodeMode: "0" }, false)).toBe("  AB  ");
    const image = "min={{getglobalvar::toggle_Card.Image.Min}} max={{getglobalvar::toggle_Card.Image.Max}}";
    expect(renderImageInstructionSource(image, { ...DEFAULT_CONFIG, minImages: 2, maxImages: 7 }, false)).toBe("min=2 max=7");
    expect(renderPreprocessInstructionSource(`  ${image}  `, { ...DEFAULT_CONFIG, minImages: 2, maxImages: 7 })).toBe("min=2 max=7");
  });


});

describe("fix: parser message order and encoding", () => {
  test("buildParserMessages emits raw CORE_PREAMBLE first, then encoded blocks in order", () => {
    const context: ParserContext = {
      systemContext: CORE_PREAMBLE + "\n\n## {{user}} Info\nAlice",
      baseBlocks: [CORE_PREAMBLE, "## {{user}} Info\nAlice"],
      preprocessingBaseBlocks: [CORE_PREAMBLE, "## {{user}} Info\nAlice"],
      preprocessingSystemContext: CORE_PREAMBLE + "\n\n## {{user}} Info\nAlice",
      recentContext: "## Previous Character Messages\n\n[History 1]\nHello world",
      override: "custom override",
      diagnostics: {},
    };
    const paragraphs: PreparedParagraph[] = [{ parserIndex: 1, originalIndex: 1, text: "Hello" }];
    const target = "[P1]\nHello";
    const config = { ...DEFAULT_CONFIG, encodeMode: "1" as const, prefillEnabled: false };
    const msgs = buildParserMessages(config, context, target);
    // Order: 0 raw CORE_PREAMBLE, 1 encoded base, 2 encoded history, 3 encoded Core, 4 encoded Image, 5 encoded user, 6 encoded override
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toBe(CORE_PREAMBLE); // raw
    expect(msgs[1].role).toBe("system");
    expect(msgs[1].content).not.toBe("## {{user}} Info\nAlice");
    expect(decodeResponse(msgs[1].content, "1")).toContain("Alice");
    expect(msgs[2].content).toContain(decodeResponse(msgs[2].content, "1").includes("Hello world") ? "" : ""); // just check decode
    expect(decodeResponse(msgs[2].content, "1")).toContain("Hello world");
    // Core should be at index 3 when encodeMode 1
    expect(decodeResponse(msgs[3].content, "1")).toContain("Base64-Encoded Instruction Protocol");
    expect(decodeResponse(msgs[4].content, "1")).toContain("# Image Tagging System");
    // user request
    expect(decodeResponse(msgs[5].content, "1")).toContain("## Current Message");
    // override
    expect(decodeResponse(msgs[6].content, "1")).toContain("custom override");
  });
test("bundled Core and Image assets are always two distinct system messages", () => {
    // Instructions come from the bundled original assets, never lorebook
    // entries. Core renders empty for encodeMode 0 (no encoding protocol);
    // Image always carries the bundled tagging instruction. Both are inserted
    // as separate system messages with the user request immediately after.
    const context: ParserContext = {
      systemContext: CORE_PREAMBLE,
      baseBlocks: [CORE_PREAMBLE],
      preprocessingBaseBlocks: [CORE_PREAMBLE],
      recentContext: "",
      override: "",
      diagnostics: {},
    };
    const msgs = buildParserMessages({ ...DEFAULT_CONFIG, encodeMode: "0", prefillEnabled: false }, context, "[P1]\nHi");
    expect(msgs[1].role).toBe("system");
    expect(msgs[1].content).toBe(""); // Core from bundled asset, encodeMode 0 -> no protocol
    expect(msgs[2].role).toBe("system");
    expect(msgs[2].content).toContain("# Image Tagging System"); // bundled Image asset
    expect(msgs[3].role).toBe("user");
  });
  test("prefill messages at absolute end when enabled, roles adapted to system/user/assistant", () => {
    const context: ParserContext = {
      systemContext: CORE_PREAMBLE,
      baseBlocks: [CORE_PREAMBLE],
      preprocessingBaseBlocks: [CORE_PREAMBLE],
      preprocessingSystemContext: CORE_PREAMBLE,
      recentContext: "",
      override: "",
      diagnostics: {},
    };
    const config = { ...DEFAULT_CONFIG, encodeMode: "0" as const, prefillEnabled: true };
    const msgs = buildParserMessages(config, context, "[P1]\nHi");
    // Last messages should be prefill adapted; original prefill contains system, tool_call, tool_response etc.
    // Check that all roles are only system/user/assistant
    for (const m of msgs) {
      expect(["system", "user", "assistant"]).toContain(m.role);
    }
    // Ensure prefill is after user message: find user request index then check tail length >0
    const userIdx = msgs.findIndex((m) => m.role === "user" && m.content.includes("Current Message"));
    expect(userIdx).toBeGreaterThan(-1);
    expect(msgs.length).toBeGreaterThan(userIdx + 1);
    // First prefill content should be system
    expect(msgs[msgs.length - 4].role).toBe("system"); // rough
  });

  test("adapt unsupported tool roles narrowly", () => {
    const raw = `<tool_call id="a"><tool_name>foo</tool_name></tool_call><tool_response id="a">ok</tool_response>`;
    const parsed = parsePrefillMessages(raw);
    expect(parsed[0].role).toBe("assistant");
    expect(parsed[1].role).toBe("user");
  });
});

describe("fix: Unicode Base64 emulates Lua UTF-8 byte-string", () => {
  test("non-ASCII round-trip preserves UTF-8 bytes", () => {
    const sample = "café — résumé naïve 日本語 🌸";
    expect(decodeResponse(encodePrompt(sample, "1"), "1")).toBe(sample);
    expect(base64Encode("é")).toBe("w6k="); // Node Buffer.from("é","utf8").toString("base64")
    expect(base64Decode("w6k=")).toBe("é");
    expect(base64Encode("🌸")).toBe("8J+MuA==");
    expect(base64Decode("8J+MuA==")).toBe("🌸");
  });
});

describe("fix: attempt history sequence 0→1 not 0→max", () => {
  test("includeCountForAttempt grows +1 per attempt", () => {
    const cfg = { ...DEFAULT_CONFIG, includeMinMessages: 0, includeMaxMessages: 8, parserRetries: 1 };
    expect(includeCountForAttempt(cfg, 0)).toBe(0);
    expect(includeCountForAttempt(cfg, 1)).toBe(1);
    const cfg2 = { ...DEFAULT_CONFIG, includeMinMessages: 2, includeMaxMessages: 5, parserRetries: 2 };
    expect(includeCountForAttempt(cfg2, 0)).toBe(2);
    expect(includeCountForAttempt(cfg2, 1)).toBe(3);
    expect(includeCountForAttempt(cfg2, 2)).toBe(4);
  });
  test("formatRecentContext returns empty when includeCount 0 regardless of greeting count", () => {
    const msgs = [
      { id: "1", role: "assistant", content: "Hello greeting" },
      { id: "2", role: "assistant", content: "Target" },
    ] as any;
    expect(formatRecentContext(msgs, 2, 0)).toBe("");
    expect(formatRecentContext(msgs, 1, 0)).toBe("");
  });
  test("formatRecentContext collects newest-first history when include>0", () => {
    const msgs = [
      { id: "1", role: "assistant", content: "Oldest" },
      { id: "2", role: "assistant", content: "Middle" },
      { id: "3", role: "assistant", content: "Target" },
    ] as any;
    const ctx = formatRecentContext(msgs, 2, 1);
    expect(ctx).toContain("[History 1]");
    expect(ctx).toContain("Middle");
    expect(ctx).toContain("- Use them only as supporting context. The current message remains the primary source for the current scene.");
    expect(formatRecentContext(msgs, 2, 1, true)).not.toContain("Use them only as supporting context");
    expect(ctx).not.toContain("Target");
  });
});

describe("fix: prompt finalization", () => {
  test("placeholder decode only when encodeMode 0", () => {
    const scene: SceneJson = { place: "room", shots: [] };
    const shot: ShotJson = {
      paragraph: 1,
      camera: "portrait",
      situation: "1girl",
      characters: [{ name: "Alice", label: "girl", appearance: "BP3 hair", body: "", attire: "SE5 dress" } as any],
    } as any;
    const cfg0 = { ...DEFAULT_CONFIG, encodeMode: "0" as const, promptSyntax: "nai" as const, supplement: false, customNegative: "", customPositivePrefix: "", customPositiveSuffix: "" };
    const entry0 = assemblePrompt(scene, shot, cfg0, 1, 1);
    expect(entry0.prompt.sections.join(", ")).toContain("pussy");
    expect(entry0.prompt.sections.join(", ")).toContain("nude");
    const cfg1 = { ...DEFAULT_CONFIG, encodeMode: "1" as const, promptSyntax: "nai" as const, supplement: false, customNegative: "", customPositivePrefix: "", customPositiveSuffix: "" };
    const entry1 = assemblePrompt(scene, shot, cfg1, 1, 1);
    expect(entry1.prompt.sections.join(", ")).not.toContain("pussy");
    expect(entry1.prompt.sections.join(", ")).toContain("BP3");
  });

  test("Comfy compatibility { -> ( and } -> )", () => {
    const scene: SceneJson = { place: "room {tag}", shots: [] };
    const shot: ShotJson = { paragraph: 1, camera: "a {b}", situation: "1girl", characters: [] } as any;
    const cfg = { ...DEFAULT_CONFIG, encodeMode: "0" as const, promptSyntax: "comfyui" as const, supplement: false, customNegative: "", customPositivePrefix: "", customPositiveSuffix: "" };
    const entry = assemblePrompt(scene, shot, cfg, 1, 1);
    const rendered = entry.prompt.sections.join(", ");
    expect(rendered).not.toContain("{");
    expect(rendered).toContain("(");
  });

  test("no duplicate supplement", () => {
    const scene: SceneJson = { place: "room", shots: [] };
    const shot: ShotJson = {
      paragraph: 1,
      camera: "portrait",
      situation: "1girl",
      characters: [],
      supplement: "soft lighting, warm atmosphere",
    } as any;
    const cfg = { ...DEFAULT_CONFIG, encodeMode: "0" as const, supplement: true, customNegative: "", customPositivePrefix: "", customPositiveSuffix: "" };
    const entry = assemblePrompt(scene, shot, cfg, 1, 1);
    const count = entry.prompt.sections.filter((s) => s.includes("soft lighting")).length;
    expect(count).toBe(1);
  });

  test("customNegative appended only to positive, never negative (defect preserved)", () => {
    const scene: SceneJson = { place: "room", shots: [] };
    const shot: ShotJson = {
      paragraph: 1,
      camera: "portrait",
      situation: "1girl",
      characters: [{ label:"girl", negative:"blurry"}] as any,
    } as any;
    const cfg = { ...DEFAULT_CONFIG, encodeMode: "0" as const, supplement: false, customNegative: "lowres, watermark", customPositivePrefix: "", customPositiveSuffix: "", presetNumber: "99" as any };
    const isolated = [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\n{prompt}" }];
    // Use getFinal directly to bypass bundled preset confusion
    const { getFinalPromptsForGeneration, extractLLMPrompts, normalizeCharacterData } = require("./prompt.js") as any;
    // Build raw via extractLLMPrompts after normalizing characters
    const normChar = normalizeCharacterData({ label:"girl", negative:"blurry"}, cfg);
    const tmpScene = { camera:"portrait", scene:"1girl, room", action:"", supplement:"", situation:"", place:"", characters:[normChar]};
    const raw = extractLLMPrompts(tmpScene, cfg);
    const [pos, neg] = getFinalPromptsForGeneration(raw, cfg, isolated);
    expect(pos).toContain("lowres");
    expect(neg).not.toContain("lowres");
    expect(neg).toContain("blurry");
  });
});

describe("fix: manual appearance clobber", () => {
  test("updateCache clobbers stored appearance unconditionally", () => {
    const cache: Record<string, string> = { Alice: "old tags" };
    const payload = {
      scenes: [{ shots: [{ paragraph: 1, characters: [{ name: "Alice", label: "girl", appearance: "new red hair", body: "", attire: "dress" }] }] }],
    } as any;
    updateCache(cache, payload);
    expect(cache["Alice"]).toBe("girl, new red hair, dress");
    expect(cache["Alice"]).not.toBe("old tags");
  });
});

describe("fix: prefillEnabled defaults false (original missing-global behavior)", () => {
  test("default config prefillEnabled false", () => {
    expect(DEFAULT_CONFIG.prefillEnabled).toBe(false);
    expect(getPrefillMessages(DEFAULT_CONFIG).length).toBe(0);
  });
  test("enabled returns adapted messages", () => {
    const cfg = { ...DEFAULT_CONFIG, prefillEnabled: true };
    const msgs = getPrefillMessages(cfg);
    expect(msgs.length).toBeGreaterThan(0);
    for (const m of msgs) expect(["system", "user", "assistant"]).toContain(m.role);
  });
});
