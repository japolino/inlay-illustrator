
import { describe, expect, test, afterEach } from "bun:test";

afterEach(() => { delete (globalThis as any).spindle; });
import { DEFAULT_CONFIG } from "../shared/config.js";
import { buildLorebookContextSnapshot, buildParserContext } from "./context.js";
import { buildParserMessages } from "./parser.js";
import { CORE_PREAMBLE } from "./instructions.js";

function mockSpindleForContext(
  books: Array<{ id: string }>,
  entriesByBook: Record<string, Array<{ id: string; content: string; comment: string; disabled?: boolean }>>,
  personaDesc: string | null,
  charDesc: string | null
) {
  (globalThis as any).spindle = {
    world_books: {
      list: async (opts: any) => {
        const offset = opts.offset || 0;
        const limit = opts.limit || 100;
        const slice = books.slice(offset, offset + limit);
        return { data: slice.map(b => ({ id: b.id, name: b.id, description: "", metadata: {}, created_at: 0, updated_at: 0 })), total: books.length };
      },
      entries: {
        list: async (bookId: string, opts: any) => {
          const all = entriesByBook[bookId] || [];
          const offset = opts.offset || 0;
          const limit = opts.limit || 100;
          const slice = all.slice(offset, offset + limit);
          return {
            data: slice.map(e => ({
              id: e.id,
              world_book_id: bookId,
              content: e.content,
              comment: e.comment,
              disabled: !!e.disabled,
              key: [],
              keysecondary: [],
            })),
            total: all.length
          };
        },
        get: async () => null
      },
      getActivated: async () => []
    },
    macros: { resolve: async (t: string) => ({ text: t, diagnostics: [] }) },
    chats: { get: async () => ({ character_id: charDesc ? "char1" : null, metadata: {} } as any) },
    personas: { getActive: async () => personaDesc !== null ? ({ description: personaDesc, name: "User" } as any) : null },
    characters: { get: async () => charDesc !== null ? ({ description: charDesc } as any) : null },
    connections: { get: async () => null },
    chat: {} as any, storage: {} as any, imageGen: {} as any, log: { error: () => {} }, sendToFrontend: () => {}, generate: { raw: async () => ({}) } as any, registerInterceptor: () => {}, on: () => {}, onFrontendMessage: () => {}
  };
}

describe("context lorebook full dump fidelity", () => {
  test("raw content only, no ### header, preserved API order, no trimming caps", async () => {
    const books = [{ id: "bookA" }, { id: "bookB" }];
    const entriesByBook = {
      bookA: [
        { id: "e1", content: "alpha", comment: "c1" },
        { id: "e2", content: "beta", comment: "c2" }
      ],
      bookB: [
        { id: "e3", content: "gamma", comment: "c3" }
      ]
    };
    mockSpindleForContext(books, entriesByBook, null, null);
    const snap = await buildLorebookContextSnapshot("chat1", "target", { includeLorebook: true });
    // Each raw content is its own block, no headers
    expect(snap.blocks).toEqual(["alpha", "beta", "gamma"]);
    expect(snap.blocks.join("\n")).not.toContain("###");
    expect(snap.blocks.join("\n")).not.toContain("Keys:");
    // API order: bookA entries then bookB entries
    expect(snap.blocks[0]).toBe("alpha");
    expect(snap.blocks[2]).toBe("gamma");
    // disabled or empty filtered
    const books2 = [{ id: "bookA" }];
    const entries2 = {
      bookA: [
        { id: "e1", content: "keep", comment: "" },
        { id: "e2", content: "", comment: "" },
        { id: "e3", content: "   ", comment: "" },
        { id: "e4", content: "skip-disabled", comment: "", disabled: true }
      ]
    };
    mockSpindleForContext(books2, entries2 as any, null, null);
    const snap2 = await buildLorebookContextSnapshot("chat1", "target", { includeLorebook: true });
    expect(snap2.blocks).toEqual(["keep", "   "]);
  });

  test("full pagination until total exhausted", async () => {
    // Create 250 entries across one book to test pagination (PAGE_LIMIT 100)
    const books = [{ id: "bigBook" }];
    const many = Array.from({ length: 250 }, (_, i) => ({ id: `e${i}`, content: `content${i}`, comment: `c${i}` }));
    mockSpindleForContext(books, { bigBook: many }, null, null);
    const snap = await buildLorebookContextSnapshot("chat1", "t", { includeLorebook: true });
    expect(snap.blocks.length).toBe(250);
    expect(snap.blocks[0]).toBe("content0");
    expect(snap.blocks[249]).toBe("content249");
    expect(snap.diagnostics.lorebookEntries).toBe(250);
  });

  test("preprocessing includes every lorebook block (false flag wrong)", async () => {
    const books = [{ id: "b1" }];
    const entries = { b1: [{ id: "e1", content: "loreA", comment: "" }, { id: "e2", content: "loreB", comment: "" }] };
    mockSpindleForContext(books, entries, "userDesc", "charDesc");
    const chatMessages = [{ id: "m1", role: "assistant", content: "hi" }] as any;
    const ctx = await buildParserContext("chat1", chatMessages, 0, {}, { ...DEFAULT_CONFIG, includeLorebook: true, includeUserInfo: true, includeCharacterInfo: true, characterTagContextEnabled: false }, 0);
    // baseBlocks should contain lore entries
    expect(ctx.baseBlocks).toContain("loreA");
    expect(ctx.baseBlocks).toContain("loreB");
    // preprocessingBaseBlocks must also contain them
    expect(ctx.preprocessingBaseBlocks).toContain("loreA");
    expect(ctx.preprocessingBaseBlocks).toContain("loreB");
    // Also check that baseBlocks and preprocessingBaseBlocks share lorebook entries same count
    const loreInBase = ctx.baseBlocks.filter(b => b === "loreA" || b === "loreB").length;
    const loreInPre = ctx.preprocessingBaseBlocks!.filter(b => b === "loreA" || b === "loreB").length;
    expect(loreInPre).toBe(loreInBase);
    expect(loreInPre).toBe(2);
  });

  test("exact info description-only, no invented fields", async () => {
    mockSpindleForContext([], {}, "PersonaDescOnly", "CharDescOnly");
    // Also need to ensure persona and character have extra fields that should NOT appear
    (globalThis as any).spindle.personas.getActive = async () => ({ description: "PersonaDescOnly", name: "MyName", title: "MyTitle", metadata: {} } as any);
    (globalThis as any).spindle.characters.get = async () => ({ description: "CharDescOnly", name: "CharName", personality: "PersonalityText", scenario: "ScenarioText", tags: ["tag1"] } as any);
    const chatMessages = [{ id: "m1", role: "assistant", content: "hi" }] as any;
    const ctx = await buildParserContext("chat1", chatMessages, 0, {}, { ...DEFAULT_CONFIG, includeUserInfo: true, includeCharacterInfo: true, includeLorebook: false, characterTagContextEnabled: false }, 0);
    const userBlock = ctx.baseBlocks.find(b => b.includes("{{user}} Info"));
    const charBlock = ctx.baseBlocks.find(b => b.includes("{{char}} Info"));
    expect(userBlock).toBe("## {{user}} Info\nPersonaDescOnly");
    expect(charBlock).toBe("## {{char}} Info\nCharDescOnly");
    // Ensure invented fields not present
    expect(userBlock).not.toContain("MyName");
    expect(userBlock).not.toContain("MyTitle");
    expect(userBlock).not.toContain("Name:");
    expect(charBlock).not.toContain("CharName");
    expect(charBlock).not.toContain("Personality");
    expect(charBlock).not.toContain("Tags:");
  });

  test("exact named overrides order and single header/footer, same on all main attempts not preprocessing", async () => {
    const books = [{ id: "book1" }, { id: "book2" }];
    const entries = {
      book1: [
        { id: "e1", content: "lb-extra-1", comment: "lb-xnai.lb.extra" },
        { id: "e2", content: "inlay-extra-1", comment: "Inlay.extra" },
        { id: "e3", content: "other", comment: "Other" }
      ],
      book2: [
        { id: "e4", content: "lb-extra-2", comment: "lb-xnai.lb.extra" },
        { id: "e5", content: "inlay-extra-2", comment: "Inlay.extra" }
      ]
    };
    mockSpindleForContext(books, entries, null, null);
    const cfg = { ...DEFAULT_CONFIG, includeLorebook: true, userInstructionsEnabled: true, customParserInstructions: "customInst", prefillEnabled: false, encodeMode: "0" as const };
    const chatMessages = [{ id: "m1", role: "assistant", content: "hi" }] as any;
    const ctx0 = await buildParserContext("chat1", chatMessages, 0, {}, cfg, 0);
    const ctx1 = await buildParserContext("chat1", chatMessages, 0, {}, cfg, 1);
    // override should be same on all main attempts
    expect(ctx0.override).toBe(ctx1.override);
    // order: custom first, then lb-xnai.lb.extra entries in book-list then entry-list order, then Inlay.extra
    expect(ctx0.override).toBe("customInst\n\nlb-extra-1\n\nlb-extra-2\n\ninlay-extra-1\n\ninlay-extra-2");
    // Check wrapping via buildParserMessages produces single header/footer
    const msgs = buildParserMessages(cfg, ctx0, "[P1]\nHello");
    const overrideMsg = msgs.find(m => m.content.includes("Priority: Instructions Override"));
    expect(overrideMsg).toBeDefined();
    expect(overrideMsg!.content).toContain("# Priority: Instructions Override");
    expect(overrideMsg!.content).toContain("> These are instructions explicitly given by the Client. If in conflict with previous instructions, this section MUST take precedence.");
    // Header appears exactly once
    expect((overrideMsg!.content.match(/# Priority: Instructions Override/g) || []).length).toBe(1);
    // Ensure raw override content inside wrapper preserved order
    const idxCustom = overrideMsg!.content.indexOf("customInst");
    const idxLb1 = overrideMsg!.content.indexOf("lb-extra-1");
    const idxInlay1 = overrideMsg!.content.indexOf("inlay-extra-1");
    expect(idxCustom).toBeLessThan(idxLb1);
    expect(idxLb1).toBeLessThan(idxInlay1);
    // customParserInstructions disabled case: first not included when null
    const cfgNull = { ...cfg, customParserInstructions: "null" };
    const ctxNull = await buildParserContext("chat1", chatMessages, 0, {}, cfgNull, 0);
    expect(ctxNull.override).not.toContain("null");
    expect(ctxNull.override).toBe("lb-extra-1\n\nlb-extra-2\n\ninlay-extra-1\n\ninlay-extra-2");
    // Fidelity: CustomInst has no enable toggle — always included when non-empty (silent migration field)
    const cfgDisabled = { ...cfg, userInstructionsEnabled: false };
    const ctxDisabled = await buildParserContext("chat1", chatMessages, 0, {}, cfgDisabled, 0);
    expect(ctxDisabled.override).toContain("customInst");
  });

  test("lorebook snapshot preserves comment/content for override even when disabled/empty filtered for blocks", async () => {
    // Ensure snapshot entries retain comment/content for override building even if disabled filtering applies to blocks
    const books = [{ id: "b1" }];
    const entries = { b1: [{ id: "e1", content: "lb-content", comment: "lb-xnai.lb.extra" }] };
    mockSpindleForContext(books, entries, null, null);
    const snap = await buildLorebookContextSnapshot("chat1", "t", { includeLorebook: true });
    expect(snap.entries[0].comment).toBe("lb-xnai.lb.extra");
    expect(snap.entries[0].content).toBe("lb-content");
  });
});
