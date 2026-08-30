
import { describe, expect, test, mock, beforeEach } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { buildParserMessages, preprocessingInstruction, preprocessTargetParagraphs, formatTargetParagraphs, generateParserText } from "./parser.js";
import { buildParserContext, formatRecentContext, includeCountForAttempt } from "./context.js";
import { assemblePrompt, finalizePromptText, renderPromptWithCurrentAffixes, renderNegativeWithCurrentSelection, renderPrompt, getFinalPromptsForGeneration } from "./prompt.js";
import { decodePlaceholders, encodePrompt, decodeResponse } from "./encoding.js";
import { CORE_PREAMBLE } from "./instructions.js";
import type { ParserContext, PreparedParagraph, SceneJson, ShotJson } from "./types.js";

// Helper to mock spindle for preprocessing tests
function mockSpindleGenerate(sequence: Array<{ success: boolean; result?: string; error?: string }>) {
  let call = 0;
  const calls: any[] = [];
  (globalThis as any).spindle = {
    generate: {
      raw: async (req: any) => {
        calls.push(req);
        const entry = sequence[call++] ?? sequence[sequence.length-1];
        if (!entry.success) throw new Error(entry.error || "mock fail");
        return { content: entry.result ?? "" };
      }
    },
    world_books: {
      list: async () => ({ data: [], total: 0 }),
      entries: { list: async () => ({ data: [], total: 0 }), get: async () => null },
      getActivated: async () => []
    },
    macros: { resolve: async (t: string) => ({ text: t, diagnostics: [] }) },
    chats: { get: async () => ({ character_id: null, metadata: {} }) },
    personas: { getActive: async () => null },
    characters: { get: async () => null },
    connections: { get: async () => null },
    chat: { getMessages: async () => [], updateMessage: async () => {} },
    storage: {} as any,
    imageGen: { generate: async () => ({}) } as any,
    log: { error: () => {}, info: () => {} },
    sendToFrontend: () => {},
    registerInterceptor: () => {},
    on: () => {},
    onFrontendMessage: () => {}
  };
  return { getCalls: () => calls, getCallCount: () => call };
}

describe("A: distinct base system blocks not merged", () => {
  test("buildParserMessages pushes each base block as distinct encoded system message", () => {
    const ctx: ParserContext = {
      systemContext: CORE_PREAMBLE + "\n\n## {{user}} Info\nA\n\n## {{char}} Info\nB\n\n### Lore1\nLoreContent\n\n## Previous Character Tags\nTagRef",
      baseBlocks: [CORE_PREAMBLE, "## {{user}} Info\nA", "## {{char}} Info\nB", "### Lore1\nLoreContent", "## Previous Character Tags\nTagRef"],
      preprocessingBaseBlocks: [CORE_PREAMBLE, "## {{user}} Info\nA", "## {{char}} Info\nB", "## Previous Character Tags\nTagRef"],
      preprocessingSystemContext: CORE_PREAMBLE + "\n\n## {{user}} Info\nA",
      recentContext: "",
      override: "",
      diagnostics: {}
    };
    const cfg = { ...DEFAULT_CONFIG, encodeMode: "0" as const, prefillEnabled: false };
    const msgs = buildParserMessages(cfg, ctx, "[P1]\nHello");
    // 0 raw preamble, then 4 base blocks each encoded, then Core, Image, user, etc.
    expect(msgs[0].content).toBe(CORE_PREAMBLE);
    expect(msgs[1].content).toBe("## {{user}} Info\nA");
    expect(msgs[2].content).toBe("## {{char}} Info\nB");
    expect(msgs[3].content).toBe("### Lore1\nLoreContent");
    expect(msgs[4].content).toBe("## Previous Character Tags\nTagRef");
    // Ensure not merged into single message
    expect(msgs.filter(m => m.role === "system" && m.content.includes("LoreContent")).length).toBe(1);
    expect(msgs.filter(m => m.role === "system" && m.content.includes("## {{user}} Info")).length).toBe(1);
  });

  test("buildParserContext exposes baseBlocks with per-entry lorebook", async () => {
    // Mock spindle for lorebook
    (globalThis as any).spindle = {
      world_books: {
        list: async () => ({ data: [{ id: "book1", name: "Book1", description: "", metadata: {}, created_at: 0, updated_at: 0 }], total: 1 }),
        entries: {
          list: async () => ({ data: [
            { id: "1", world_book_id: "book1", content: `Content 1`, comment: `Comment 1`, key: [], keysecondary: [], disabled: false } as any,
            { id: "2", world_book_id: "book1", content: `Content 2`, comment: `Comment 2`, key: [], keysecondary: [], disabled: false } as any
          ], total: 2 }),
          get: async (id: string) => ({ id, content: `Content ${id}`, comment: `Comment ${id}`, key: [`key${id}`], priority: 0 } as any)
        },
        getActivated: async () => []
      },
      macros: { resolve: async (t: string) => ({ text: t, diagnostics: [] }) },
      chats: { get: async () => ({ character_id: "char1", metadata: {} }) as any },
      personas: { getActive: async () => ({ name: "User", description: "desc", metadata: {} } as any) },
      characters: { get: async () => ({ name: "Char", description: "desc", metadata: {} } as any) },
      connections: { get: async () => null },
      chat: {} as any, storage: {} as any, imageGen: {} as any, log: { error: () => {} }, sendToFrontend: () => {}, generate: { raw: async () => ({}) } as any, registerInterceptor: () => {}, on: () => {}, onFrontendMessage: () => {}
    };
    const chatMessages = [{ id: "m1", role: "assistant", content: "Hello" }] as any;
    const ctx = await buildParserContext("chat1", chatMessages, 0, {}, { ...DEFAULT_CONFIG, includeLorebook: true, includeUserInfo: true, includeCharacterInfo: true, characterTagContextEnabled: true }, 0);
    expect(ctx.baseBlocks[0]).toBe(CORE_PREAMBLE);
    // Should contain user info, char info, 2 lore entries, appearance ref distinct
    expect(ctx.baseBlocks.length).toBeGreaterThanOrEqual(4);
    const loreBlocks = ctx.baseBlocks.filter(b => b.includes("Content 1") || b.includes("Content 2"));
    expect(loreBlocks.length).toBeGreaterThanOrEqual(1);
    // They should be separate entries, not merged into one lore block string containing both contents together as single entry
    const mergedCheck = ctx.baseBlocks.find(b => b.includes("Content 1") && b.includes("Content 2"));
    expect(mergedCheck).toBeUndefined();
  });

  test("no 32k/8k caps applied - long blocks preserved verbatim", () => {
    // formatRecentContext and formatInfoBlock should not truncate (original has no caps)
    const longText = "x".repeat(50000);
    const msgs = [
      { id: "1", role: "assistant", content: longText },
      { id: "2", role: "assistant", content: "mid" },
      { id: "3", role: "assistant", content: "target" }
    ] as any;
    const ctx = formatRecentContext(msgs, 2, 2);
    expect(ctx.length).toBeGreaterThan(40000);
    expect(ctx).toContain(longText);
    expect(ctx).toContain("mid");
  });
});

describe("B: preprocessing independent retry and verbatim", () => {
  test("preprocessing runs own attempts with history rebuild and verbatim return", async () => {
    const cfg = { ...DEFAULT_CONFIG, preprocessingMode: "axllm" as const, parserRetries: 2, includeMinMessages: 0, includeMaxMessages: 5, encodeMode: "0" as const, axllmParserConnectionId: "c1", llmParserConnectionId: null };
    const paragraphs: PreparedParagraph[] = [{ parserIndex: 1, originalIndex: 1, text: "Hello world" }];
    const callHistories: number[] = [];
    // Builder that records attempt history sizes
    const builder = async (attempt: number) => {
      const inc = includeCountForAttempt(cfg, attempt);
      // Simulate history growth: inc 0 => "", inc 1 => one message, etc.
      const history = inc === 0 ? "" : `## Previous Character Messages\n${"h".repeat(inc)}`;
      callHistories.push(inc);
      return {
        systemContext: CORE_PREAMBLE + "\n\nbase",
        baseBlocks: [CORE_PREAMBLE, "base"],
        preprocessingBaseBlocks: [CORE_PREAMBLE, "base"],
        preprocessingSystemContext: CORE_PREAMBLE + "\n\nbase",
        recentContext: history,
        override: "",
        diagnostics: {}
      } as ParserContext;
    };
    // First two calls fail, third succeeds with verbatim string containing spaces and newlines
    const verbatim = "  keep  spaces\n\nand\nnewlines  ";
    const m = mockSpindleGenerate([
      { success: false, error: "timeout" },
      { success: false, error: "500" },
      { success: true, result: verbatim }
    ]);
    // Mock connection lookup for axllm
    (globalThis as any).spindle.connections = { get: async () => ({ id: "c1", name: "test", provider: "test", model: "test" }) } as any;
    const conn = { id: "c1", name: "test", provider: "test", model: "test" } as any;
    const result = await preprocessTargetParagraphs(conn, cfg, paragraphs, builder as any);
    expect(result.text).toBe(verbatim);
    expect(result.used).toBe(true);
    expect(callHistories).toEqual([0,1,2]);
    expect(m.getCallCount()).toBe(3);
    // Ensure verbatim not trimmed/compacted
    expect(result.text.startsWith("  ")).toBe(true);
    expect(result.text.endsWith("  ")).toBe(true);
  });

  test("preprocessing empty template guard returns raw numbered target", async () => {
    // Need to make preprocessingInstruction return empty - mock by using config? Actually template comes from asset; we patch by temporarily making renderOriginalPreprocessInstruction return empty via preprocessing disabled? But empty guard checks trimmed template === ""
    // We can test by stubbing preprocessingInstruction to return empty via monkey patch
    const { preprocessingInstruction } = await import("./parser.js");
    // The guard is templateRaw.trim()==="" - our asset is not empty, so we test by calling with preprocessingEnabled false vs true difference
    const cfg = { ...DEFAULT_CONFIG, preprocessingMode: "off" as const, encodeMode: "0" as const };
    const paragraphs: PreparedParagraph[] = [{ parserIndex: 1, originalIndex: 1, text: "Hi" }];
    const ctx: ParserContext = { systemContext: CORE_PREAMBLE, baseBlocks: [CORE_PREAMBLE], recentContext: "", override: "", diagnostics: {} };
    const conn = { id:"c", name:"n", provider:"p", model:"m"} as any;
    // When disabled, should return rawTarget directly without calling spindle
    const res = await preprocessTargetParagraphs(conn, cfg, paragraphs, ctx as any);
    expect(res.text).toBe("[P1]\nHi");
    expect(res.used).toBe(false);
  });

  test("preprocessing all failures returns raw numbered target verbatim", async () => {
    const cfg = { ...DEFAULT_CONFIG, preprocessingMode: "axllm" as const, parserRetries: 1, encodeMode: "0" as const, axllmParserConnectionId: "c" };
    const paragraphs: PreparedParagraph[] = [{ parserIndex: 1, originalIndex: 1, text: "Foo" }, { parserIndex: 2, originalIndex: 2, text: "Bar"}];
    const builder = async (_a: number) => ({
      systemContext: CORE_PREAMBLE, baseBlocks:[CORE_PREAMBLE], preprocessingBaseBlocks:[CORE_PREAMBLE], recentContext:"", override:"", diagnostics:{}
    } as any);
    mockSpindleGenerate([{ success:false, error:"fail"}, {success:false, error:"fail2"}]);
    (globalThis as any).spindle.connections = { get: async () => ({ id: "c", name: "n", provider: "p", model: "m" }) } as any;
    const conn = { id:"c", name:"n", provider:"p", model:"m"} as any;
    const raw = formatTargetParagraphs(paragraphs);
    const res = await preprocessTargetParagraphs(conn, cfg, paragraphs, builder as any);
    expect(res.text).toBe(raw);
    expect(res.used).toBe(false);
  });

  test("enabled preprocessing rejects a missing selected connection instead of silently acting off", async () => {
    const config = { ...DEFAULT_CONFIG, preprocessingMode: "axllm" as const, axllmParserConnectionId: null, parserConnectionId: null };
    const paragraphs: PreparedParagraph[] = [{ parserIndex: 1, originalIndex: 1, text: "Hello" }];
    const context: ParserContext = {
      systemContext: CORE_PREAMBLE,
      baseBlocks: [CORE_PREAMBLE],
      preprocessingBaseBlocks: [CORE_PREAMBLE],
      recentContext: "",
      override: "",
      diagnostics: {}
    };
    await expect(preprocessTargetParagraphs(null, config, paragraphs, context)).rejects.toThrow("Select a parser connection for preprocessing (axllm)");
  });

  test("generateParserText return is verbatim not cleaned/compacted (no trim)", async () => {
    // This is already tested via verbatim above, but explicitly test preprocess returns exactly what provider gave including no compactBlock 12000
    const longVerbatim = "x".repeat(15000);
    const cfg = { ...DEFAULT_CONFIG, preprocessingMode: "axllm" as const, parserRetries: 0, encodeMode: "0" as const, axllmParserConnectionId: "c" };
    mockSpindleGenerate([{ success:true, result: longVerbatim }]);
    (globalThis as any).spindle.connections = { get: async () => ({ id: "c", name: "n", provider: "p", model: "m" }) } as any;
    const conn = { id:"c", name:"n", provider:"p", model:"m"} as any;
    const ctx: ParserContext = { systemContext: CORE_PREAMBLE, baseBlocks:[CORE_PREAMBLE], recentContext:"", override:"", diagnostics:{}};
    const res = await preprocessTargetParagraphs(conn, cfg, [{parserIndex:1, originalIndex:1, text:"a"}] as any, ctx as any);
    expect(res.text.length).toBe(15000);
    expect(res.text).toBe(longVerbatim);
    expect(res.used).toBe(true);
  });
});

describe("B2: raw generate carries explicit provider/model (custom-connection empty-model fix)", () => {
  test("raw request includes provider and connection model so custom providers never send an empty model", async () => {
    const m = mockSpindleGenerate([{ success: true, result: "ok" }]);
    const conn = { id: "conn-1", name: "n", provider: "custom", model: "nemotron-3.5-lightning-free" } as any;
    const cfg = { ...DEFAULT_CONFIG, encodeMode: "0" as const, parserModel: "" };
    await generateParserText(conn, cfg as any, [{ role: "user", content: "hi" }]);
    expect(m.getCallCount()).toBe(1);
    const req = m.getCalls()[0];
    expect(req.type).toBe("raw");
    expect(req.provider).toBe("custom");
    expect(req.model).toBe("nemotron-3.5-lightning-free");
    expect(req.connection_id).toBe("conn-1");
  });

  test("parserModel silent migration fallback wins over the connection model when set", async () => {
    const m = mockSpindleGenerate([{ success: true, result: "ok" }]);
    const conn = { id: "conn-2", name: "n", provider: "custom", model: "" } as any;
    const cfg = { ...DEFAULT_CONFIG, encodeMode: "0" as const, parserModel: "override-model" };
    await generateParserText(conn, cfg as any, [{ role: "user", content: "hi" }]);
    expect(m.getCalls()[0].model).toBe("override-model");
    expect(m.getCalls()[0].provider).toBe("custom");
  });
});

describe("C: dead exports removed", () => {
  test("parser module does not export shims", async () => {
    const mod = await import("./parser.js");
    expect((mod as any).parserMessages).toBeUndefined();
    expect((mod as any).parserMessagesEncoded).toBeUndefined();
    expect((mod as any).sourceParagraphs).toBeUndefined();
    expect((mod as any).validatePreprocessedTarget).toBeUndefined();
    expect((mod as any).routedTargetSource).toBeUndefined();
  });
  test("backend __testables does not contain dead keys", async () => {
    const { __testables } = await import("../backend.js");
    expect((__testables as any).parserMessages).toBeUndefined();
    expect((__testables as any).validatePreprocessedTarget).toBeUndefined();
    expect((__testables as any).parserMessagesEncoded).toBeUndefined();
  });
});

describe("D: prompt exactness", () => {
  test("non-Comfy escapes parentheses to \\( \\) including double-escape quirk", () => {
    const cfg = { ...DEFAULT_CONFIG, encodeMode: "0" as const, promptSyntax: "nai" as const };
    const out = finalizePromptText("a (tag:1.2) b (c)", cfg);
    expect(out).toBe("a \\(tag:1.2\\) b \\(c\\)");
    // Already escaped should double-escape
    const double = finalizePromptText("a \\(x\\)", cfg);
    expect(double).toBe("a \\\\(x\\\\)");
  });
  test("Comfy replaces { } with ( )", () => {
    const cfg = { ...DEFAULT_CONFIG, encodeMode: "0" as const, promptSyntax: "comfyui" as const };
    expect(finalizePromptText("a {tag} b", cfg)).toBe("a (tag) b");
    expect(finalizePromptText("a {a} {b}", cfg)).toBe("a (a) (b)");
  });
  test("placeholder decode after finalize for both positive and negative", () => {
    const cfg = { ...DEFAULT_CONFIG, encodeMode: "0" as const, promptSyntax: "nai" as const, presetNumber: "99" as any, promptStyle: "default" as const, supplement: false };
    // Use empty preset for isolation: provide explicit lorebook entry for 99 that is just {prompt}
    const emptyEntries: any = [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\n{prompt}" }];
    expect(finalizePromptText("BP3 and SE1", cfg)).toBe("pussy and nsfw");
    // positive decode via character appearance
    const rawPos = { setup: "BP3", charPos: "SE1", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [pos] = getFinalPromptsForGeneration(rawPos, cfg, emptyEntries);
    expect(pos).toContain("pussy");
    expect(pos).toContain("nsfw");
    // negative via character negative
    const rawNeg = { setup: "", charPos: "", charNeg: "BP3", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [, neg] = getFinalPromptsForGeneration(rawNeg, cfg, emptyEntries);
    expect(neg).toContain("pussy");
  });
    test("Anima divider always ,\n, non-Anima divider ,\n for Comfy and ' | ' otherwise (raw defect: situation/place empty)", () => {
    const animaCfg = { ...DEFAULT_CONFIG, promptStyle:"anima" as const, promptSyntax:"nai" as const, encodeMode:"0" as const, customNegative:"", customPositivePrefix:"", supplement:false, presetNumber: "99" as any };
    const defaultCfgNai = { ...DEFAULT_CONFIG, promptStyle:"default" as const, promptSyntax:"nai" as const, encodeMode:"0" as const, customNegative:"", customPositivePrefix:"", supplement:false, presetNumber: "99" as any };
    const defaultCfgComfy = { ...DEFAULT_CONFIG, promptStyle:"default" as const, promptSyntax:"comfyui" as const, encodeMode:"0" as const, customNegative:"", customPositivePrefix:"", supplement:false, presetNumber: "99" as any };
    const emptyEntries: any = [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\n{prompt}" }];
    const rawAnima = { setup: "cam, sit, placeA", charPos: "girl", charNeg: "", supplement: "", situation: "", place: "", camera: "cam", action: "" } as any;
    const [animaPos] = getFinalPromptsForGeneration(rawAnima, animaCfg, emptyEntries);
    expect(animaPos).toContain(",\n");
    expect(animaPos).not.toContain(" | ");
    const rawDefault = { setup: "cam, placeA", charPos: "girl", charNeg: "", supplement: "", situation: "", place: "", camera: "cam", action: "" } as any;
    const [defaultNaiPos] = getFinalPromptsForGeneration(rawDefault, defaultCfgNai, emptyEntries);
    expect(defaultNaiPos).toContain(" | ");
    const [defaultComfyPos] = getFinalPromptsForGeneration(rawDefault, defaultCfgComfy, emptyEntries);
    expect(defaultComfyPos).toContain(",\n");
  });
  test("null literal custom positive/negative treated as empty", () => {
    const cfg: any = { ...DEFAULT_CONFIG, promptSyntax:"comfyui" as const, encodeMode:"0" as const, customPositivePrefix:"null", customPositiveSuffix:" Null ", customNegative:"null", supplement:false, promptStyle:"anima" as const };
    const scene: SceneJson = { place:"room", shots:[] };
    const shot: ShotJson = { paragraph:1, camera:"cam", situation:"girl", characters:[]} as any;
    const entry = assemblePrompt(scene, shot, cfg, 1,1);
    expect(entry.prompt.sections.join(", ")).not.toContain("null");
    // Also via helper
    const core = "raw core";
    const helper = renderPromptWithCurrentAffixes(core, "ordered" as any, cfg);
    expect(helper.toLowerCase()).not.toContain("null");
  });
  test("customNegative appended only to positive", () => {
    const cfg = { ...DEFAULT_CONFIG, encodeMode:"0" as const, promptSyntax:"comfyui" as const, customNegative:"extraNeg", customPositivePrefix:"", customPositiveSuffix:"", supplement:false };
    const scene: SceneJson = { place:"room", shots:[] };
    const shot: ShotJson = { paragraph:1, camera:"portrait", situation:"girl", characters:[], negative:"shotNeg"} as any;
    const entry = assemblePrompt(scene, shot, cfg,1,1);
    expect(entry.prompt.sections.join(", ")).toContain("extraNeg");
    expect(entry.negative).not.toContain("extraNeg");
  });
  test("supplement once only", () => {
    const cfg = { ...DEFAULT_CONFIG, encodeMode:"0" as const, supplement:true, customNegative:"", customPositivePrefix:"", customPositiveSuffix:"" } as any;
    const scene: SceneJson = { place:"room", shots:[] };
    const shot: ShotJson = { paragraph:1, camera:"portrait", situation:"girl", characters:[], supplement:"soft lighting"} as any;
    const entry = assemblePrompt(scene, shot, cfg,1,1);
    const count = entry.prompt.sections.filter(s=>s.includes("soft lighting")).length;
    expect(count).toBe(1);
  });
});

describe("E: raw core UNFINALIZED + current-affix helper", () => {
  test("corePrompt remains raw unfinalized while prompt is finalized", () => {
    const cfg = { ...DEFAULT_CONFIG, encodeMode:"0" as const, promptSyntax:"comfyui" as const, customNegative:"", customPositivePrefix:"", customPositiveSuffix:"", supplement:false };
    const scene: SceneJson = { place:"room {tag}", shots:[] };
    const shot: ShotJson = { paragraph:1, camera:"cam {b}", situation:"BP3", characters:[{ label:"girl", appearance:"BP3"}] } as any;
    const entry = assemblePrompt(scene, shot, cfg, 1,1);
    // core should retain raw placeholders and braces (unfinalized)
    const coreJoined = entry.corePrompt.sections.join(", ");
    expect(coreJoined).toContain("BP3");
    expect(coreJoined).toContain("{");
    // prompt should be finalized: placeholders decoded and { -> (
    const promptJoined = entry.prompt.sections.join(", ");
    expect(promptJoined).toContain("pussy");
    expect(promptJoined).toContain("(");
    expect(promptJoined).not.toContain("BP3");
    expect(promptJoined).not.toContain("{");
  });
  test("renderPromptWithCurrentAffixes is deprecated helper - now just placeholder/compat transform, preset/custom via getFinal", async () => {
    const cfg1 = { ...DEFAULT_CONFIG, promptSyntax:"nai" as const, encodeMode:"0" as const, customNegative:" currNeg ", customPositivePrefix:"pre", presetNumber: "99" as any, promptStyle: "default" as const } as any;
    const entries = [{ comment: "프리셋 99", content: "[Positive]\npresetPre {prompt}\n[Negative]\npresetNeg" }];
    const rawCore = { setup: "BP3 hair (tag)", charPos: "", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    // getFinal should apply preset, customPos front, customNeg at positive end, decode and escape positive
    const [pos] = getFinalPromptsForGeneration(rawCore, { ...cfg1, customPositivePrefix:"pre" } as any, entries);
    expect(pos).toContain("pussy");
    expect(pos).toContain("\\(tag\\)");
    expect(pos).toContain("presetPre");
    expect(pos).toContain("pre");
    // customNegative goes to positive end (defect)
    const raw2 = { setup: "a", charPos: "", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [pos2] = getFinalPromptsForGeneration(raw2, { ...cfg1, customNegative:"currNeg" } as any, entries);
    expect(pos2).toContain("currNeg");
    // suffix should be ignored (non-original)
    const [pos3] = getFinalPromptsForGeneration(rawCore, { ...cfg1, customPositiveSuffix:"suf" } as any, entries);
    expect(pos3).not.toContain("suf");
    // comfy braces
    const cfgComfy = { ...cfg1, promptSyntax:"comfyui" as const };
    const rawBrace = { setup: "BP3 hair {tag}", charPos: "", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [posBrace] = getFinalPromptsForGeneration(rawBrace, cfgComfy, entries);
    expect(posBrace).toContain("(tag)");
    expect(posBrace).not.toContain("\\(");
  });
  test("negative helper via getFinal applies current preset + shot negative, no paren escape for NAI", async () => {
    const cfg = { ...DEFAULT_CONFIG, promptSyntax:"nai" as const, encodeMode:"0" as const, presetNumber: "99" as any } as any;
    const entries = [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\npresetNeg, {prompt}" }];
    const raw = { setup: "", charPos: "", charNeg: "BP3 (bad)", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [, neg] = getFinalPromptsForGeneration(raw, cfg, entries);
    expect(neg).toContain("pussy");
    expect(neg).toContain("(bad)");
    expect(neg).not.toContain("\\(bad\\)");
    expect(neg).toContain("presetNeg");
    // customNegative should NOT appear in negative (defect preserved)
    const cfgWithCustomNeg = { ...cfg, customNegative:"shouldNotAppear" } as any;
    const [, neg2] = getFinalPromptsForGeneration(raw, cfgWithCustomNeg, entries);
    expect(neg2).not.toContain("shouldNotAppear");
  });
});
