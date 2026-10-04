import { beforeEach, describe, expect, test } from "bun:test";
import { MARKER } from "./constants.js";
import { buildLorebookContextSnapshot, formatRecentContext, isOwnMessage, loadContextSources } from "./context.js";
import type { ChatMessage } from "./types.js";

let activationCalls = 0;
let entryCalls: string[] = [];
let macroCalls: Array<{ content: string; options: Record<string, unknown> }> = [];

beforeEach(() => {
  activationCalls = 0;
  entryCalls = [];
  macroCalls = [];
  (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle = {
    chats: { get: async () => ({ id: "chat-1" }) },
    personas: { getActive: async () => null },
    characters: { get: async () => null },
    world_books: {
      getActivated: async () => {
        activationCalls += 1;
        return [];
      },
      entries: {
        get: async (id: string) => {
          entryCalls.push(id);
          return null;
        }
      }
    },
    macros: {
      resolve: async (content: string, options: Record<string, unknown>) => {
        macroCalls.push({ content, options });
        return { text: content.replaceAll("{{char}}", "Elara"), diagnostics: [] };
      }
    }
  };
});

describe("recent context", () => {
  test("includes prior narrative without Inlay markup or embedded prompts", () => {
    const inlay = `${MARKER}\n<div data-inlay-illustrator="true"><img src="/generated.png" data-inlay-illustrator-prompt="secret prompt"><pre class="inlay-illustrator-prompt" hidden>secret prompt</pre></div>`;
    const messages: ChatMessage[] = [
      { id: "a1", role: "assistant", content: `Earlier narrative.\n\n${inlay}` },
      { id: "u1", role: "user", content: "User reply." },
      { id: "a2", role: "assistant", content: `${inlay}\n\nRecent narrative.` },
      { id: "a3", role: "assistant", content: inlay },
      { id: "target", role: "assistant", content: "Current target." }
    ];

    const context = formatRecentContext(messages, 4, 2);

    expect(context).toContain("assistant: Earlier narrative.");
    expect(context).toContain("assistant: Recent narrative.");
    expect(context).not.toContain(MARKER);
    expect(context).not.toContain("data-inlay-illustrator");
    expect(context).not.toContain("<img");
    expect(context).not.toContain("<pre");
    expect(context).not.toContain("secret prompt");
  });

  test("includes the greeting on the first post-greeting turn even with zero minimum context", () => {
    const messages: ChatMessage[] = [
      { id: "greeting", role: "assistant", content: "Late afternoon sunlight crosses the school clubroom." },
      { id: "user", role: "user", content: "I sit beside the desk." },
      { id: "target", role: "assistant", content: "She closes the book." }
    ];

    expect(formatRecentContext(messages, 2, 0)).toContain("Late afternoon sunlight");
  });

  test("keeps zero context truly empty after the first post-greeting turn", () => {
    const messages: ChatMessage[] = [
      { id: "greeting", role: "assistant", content: "Late afternoon in the clubroom." },
      { id: "earlier", role: "assistant", content: "She opens a book." },
      { id: "target", role: "assistant", content: "She closes the book." }
    ];

    expect(formatRecentContext(messages, 2, 0)).toBe("");
  });
});

describe("activated lorebook context", () => {
  test("resolves one activated snapshot and ranks target-relevant visual content ahead of unrelated prose", async () => {
    const spindleMock = (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle as Record<string, any>;
    spindleMock.world_books.getActivated = async () => {
      activationCalls += 1;
      return [
        { id: "village", comment: "Village history", keys: ["village"], source: "keyword", bookSource: "global" },
        { id: "elara", comment: "Elara", keys: ["Elara", "silver mage"], source: "keyword", bookSource: "character" }
      ];
    };
    spindleMock.world_books.entries.get = async (id: string) => {
      entryCalls.push(id);
      if (id === "elara") return {
        id,
        key: ["Elara"],
        comment: "Elara",
        content: "{{char}} has long silver hair, violet eyes, pale skin, and wears a blue mage robe.\n\nShe studies forgotten languages.",
        priority: 20
      };
      return {
        id,
        key: ["village"],
        comment: "Village history",
        content: `${"The village changed rulers many times. ".repeat(80)}A bronze gate marks its entrance.`,
        priority: 1
      };
    };

    const snapshot = await buildLorebookContextSnapshot("chat-1", "Elara enters the moonlit temple.", "user-1");

    expect(activationCalls).toBe(1);
    expect(entryCalls.sort()).toEqual(["elara", "village"]);
    expect(macroCalls).toHaveLength(2);
    expect(macroCalls.every((call) => call.options.commit === false && call.options.chatId === "chat-1")).toBe(true);
    expect(snapshot.compact.indexOf("### Elara")).toBeLessThan(snapshot.compact.indexOf("### Village history"));
    expect(snapshot.compact).toContain("Elara has long silver hair, violet eyes");
    expect(snapshot.compact.length).toBeLessThanOrEqual(4000);
    expect(snapshot.full).toContain("A bronze gate marks its entrance");
    expect(snapshot.compacted).toBe(true);
    expect(snapshot.hasCharacterVisualReference).toBe(true);
  });

  test("selects a directly relevant entry before applying the 24-entry fetch limit", async () => {
    const spindleMock = (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle as Record<string, any>;
    spindleMock.world_books.getActivated = async () => Array.from({ length: 30 }, (_value, index) => ({
      id: index === 29 ? "target-entry" : `generic-${index}`,
      comment: index === 29 ? "Moonblade" : `Generic ${index}`,
      keys: index === 29 ? ["Moonblade"] : [`generic-${index}`],
      source: "keyword",
      bookSource: "global"
    }));
    spindleMock.world_books.entries.get = async (id: string) => {
      entryCalls.push(id);
      return { id, key: [id], comment: id, content: `${id} visual reference`, priority: 0 };
    };

    const snapshot = await buildLorebookContextSnapshot("chat-1", "She raises the Moonblade.");

    expect(entryCalls).toHaveLength(24);
    expect(entryCalls).toContain("target-entry");
    expect(snapshot.compact).toContain("Moonblade");
    expect(snapshot.diagnostics).toMatchObject({ lorebookActivated: 30, lorebookSelected: 24 });
  });
});

describe("context sources", () => {
  test("loads chat, character and persona, and records failures", async () => {
    const spindleMock = (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle as Record<string, any>;
    spindleMock.chats.get = async () => ({ id: "chat-1", character_id: "char-1" });
    spindleMock.characters.get = async (id: string) => ({ id, name: "Elara" });
    spindleMock.personas.getActive = async () => { throw new Error("no persona"); };
    const sources = await loadContextSources("chat-1", "user-1");
    expect(sources.chat).toMatchObject({ id: "chat-1" });
    expect(sources.character).toMatchObject({ name: "Elara" });
    expect(sources.persona).toBeNull();
    expect(sources.diagnostics.personaError).toBe("no persona");
    const withoutCharacter = await loadContextSources("chat-1", "user-1", { character: false, persona: false });
    expect(withoutCharacter.character).toBeNull();
  });

  test("recognizes messages written by this extension", () => {
    expect(isOwnMessage({ metadata: { extension: "inlay_illustrator" } })).toBe(true);
    expect(isOwnMessage({ metadata: {} })).toBe(false);
  });
});
