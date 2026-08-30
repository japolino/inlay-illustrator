
import { describe, expect, test, afterEach } from "bun:test";

afterEach(() => { delete (globalThis as any).spindle; });
import { DEFAULT_CONFIG } from "../shared/config.js";
import { buildLorebookContextSnapshot, buildParserContext } from "./context.js";
import { buildParserMessages } from "./parser.js";
import { CORE_PREAMBLE } from "./instructions.js";

function mockSpindleForContext(
  activated: Array<{ id: string; comment: string; bookId?: string }>,
  entriesById: Record<string, { id: string; content: string; comment: string; disabled?: boolean; world_book_id?: string }>,
  personaDesc: string | null,
  charDesc: string | null
) {
  (globalThis as any).spindle = {
    world_books: {
      list: async () => ({ data: [], total: 0 }),
      entries: {
        list: async () => ({ data: [], total: 0 }),
        get: async (entryId: string) => entriesById[entryId] || null
      },
      getActivated: async () => activated
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
  test("raw content only, no ### header, preserved activation order, no trimming caps", async () => {
    const activated = [
      { id: "e1", comment: "c1", bookId: "bookA" },
      { id: "e2", comment: "c2", bookId: "bookA" },
      { id: "e3", comment: "c3", bookId: "bookB" }
    ];
    const entriesById = {
      e1: { id: "e1", content: "alpha", comment: "c1", world_book_id: "bookA" },
      e2: { id: "e2", content: "beta", comment: "c2", world_book_id: "bookA" },
      e3: { id: "e3", content: "gamma", comment: "c3", world_book_id: "bookB" }
    };
    mockSpindleForContext(activated, entriesById, null, null);
    const snap = await buildLorebookContextSnapshot("chat1", "target", { includeLorebook: true });
    // Each raw content is its own block, no headers; activation order preserved.
    expect(snap.blocks).toEqual(["alpha", "beta", "gamma"]);
    expect(snap.blocks.join("\n")).not.toContain("###");
    expect(snap.blocks.join("\n")).not.toContain("Keys:");
    expect(snap.blocks[0]).toBe("alpha");
    expect(snap.blocks[2]).toBe("gamma");
    // Activated entries with empty/whitespace content: empty is filtered, whitespace kept.
    const activated2 = [
      { id: "e1", comment: "" }, { id: "e2", comment: "" }, { id: "e3", comment: "" }
    ];
    const entriesById2 = {
      e1: { id: "e1", content: "keep", comment: "" },
      e2: { id: "e2", content: "", comment: "" },
      e3: { id: "e3", content: "   ", comment: "" }
    };
    mockSpindleForContext(activated2, entriesById2, null, null);
    const snap2 = await buildLorebookContextSnapshot("chat1", "target", { includeLorebook: true });
    expect(snap2.blocks).toEqual(["keep", "   "]);
  });

  test("activated-only snapshot is capped to the host's ranked limit", async () => {
    // The host returns activated entries ranked; the snapshot must not dump every
    // library entry. Cap is MAX_ACTIVATED_LOREBOOK_ENTRIES = 24.
    const activated = Array.from({ length: 250 }, (_, i) => ({ id: `e${i}`, comment: `c${i}`, bookId: "bigBook" }));
    const entriesById: Record<string, any> = {};
    for (let i = 0; i < 250; i += 1) entriesById[`e${i}`] = { id: `e${i}`, content: `content${i}`, comment: `c${i}`, world_book_id: "bigBook" };
    mockSpindleForContext(activated, entriesById, null, null);
    const snap = await buildLorebookContextSnapshot("chat1", "t", { includeLorebook: true });
    expect(snap.blocks.length).toBe(24);
    expect(snap.blocks[0]).toBe("content0");
    expect(snap.blocks[23]).toBe("content23");
    expect(snap.diagnostics.lorebookEntries).toBe(24);
    expect(snap.diagnostics.lorebookActivated).toBe(250);
  });

  test("preprocessing includes every activated lorebook block", async () => {
    const activated = [{ id: "e1", comment: "" }, { id: "e2", comment: "" }];
    const entries = { e1: { id: "e1", content: "loreA", comment: "" }, e2: { id: "e2", content: "loreB", comment: "" } };
    mockSpindleForContext(activated, entries, "userDesc", "charDesc");
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
    const activated = [
      { id: "e1", comment: "lb-xnai.lb.extra", bookId: "book1" },
      { id: "e2", comment: "Inlay.extra", bookId: "book1" },
      { id: "e3", comment: "Other", bookId: "book1" },
      { id: "e4", comment: "lb-xnai.lb.extra", bookId: "book2" },
      { id: "e5", comment: "Inlay.extra", bookId: "book2" }
    ];
    const entries = {
      e1: { id: "e1", content: "lb-extra-1", comment: "lb-xnai.lb.extra", world_book_id: "book1" },
      e2: { id: "e2", content: "inlay-extra-1", comment: "Inlay.extra", world_book_id: "book1" },
      e3: { id: "e3", content: "other", comment: "Other", world_book_id: "book1" },
      e4: { id: "e4", content: "lb-extra-2", comment: "lb-xnai.lb.extra", world_book_id: "book2" },
      e5: { id: "e5", content: "inlay-extra-2", comment: "Inlay.extra", world_book_id: "book2" }
    };
    mockSpindleForContext(activated, entries, null, null);
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

  test("lorebook snapshot preserves comment/content for the .extra override", async () => {
    const activated = [{ id: "e1", comment: "lb-xnai.lb.extra", bookId: "b1" }];
    const entries = { e1: { id: "e1", content: "lb-content", comment: "lb-xnai.lb.extra", world_book_id: "b1" } };
    mockSpindleForContext(activated, entries, null, null);
    const snap = await buildLorebookContextSnapshot("chat1", "t", { includeLorebook: true });
    expect(snap.entries[0].comment).toBe("lb-xnai.lb.extra");
    expect(snap.entries[0].content).toBe("lb-content");
  });
});
