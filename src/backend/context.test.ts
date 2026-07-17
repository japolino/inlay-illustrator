import { beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { MARKER } from "./constants.js";
import { buildLorebookContextSnapshot, buildParserContext, formatRecentContext } from "./context.js";
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

describe("recent parser context", () => {
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
});

describe("activated lorebook parser context", () => {
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

    const snapshot = await buildLorebookContextSnapshot("chat-1", "Elara enters the moonlit temple.", { includeLorebook: true }, "user-1");

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

  test("uses compact lorebook only for the first JSON attempt and excludes it from preprocessing", async () => {
    const config = {
      ...DEFAULT_CONFIG,
      includeLorebook: true,
      includeUserInfo: false,
      includeCharacterInfo: false,
      characterTagContextEnabled: false,
      userInstructionsEnabled: false
    };
    const messages: ChatMessage[] = [{ id: "target", role: "assistant", content: "Current target." }];
    const snapshot = {
      compact: "## Lorebook\n\nCOMPACT ENTRY",
      full: "## Lorebook\n\nFULL ENTRY",
      compacted: true,
      hasCharacterVisualReference: true,
      diagnostics: { lorebookEntries: 1 }
    };

    const first = await buildParserContext("chat-1", messages, 0, {}, config, 0, "user-1", snapshot);
    const retry = await buildParserContext("chat-1", messages, 0, {}, config, 1, "user-1", snapshot);

    expect(first.systemContext).toContain("COMPACT ENTRY");
    expect(first.systemContext).not.toContain("FULL ENTRY");
    expect(first.preprocessingSystemContext).not.toContain("COMPACT ENTRY");
    expect(retry.systemContext).toContain("FULL ENTRY");
    expect(activationCalls).toBe(0);
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

    const snapshot = await buildLorebookContextSnapshot("chat-1", "She raises the Moonblade.", { includeLorebook: true });

    expect(entryCalls).toHaveLength(24);
    expect(entryCalls).toContain("target-entry");
    expect(snapshot.compact).toContain("Moonblade");
    expect(snapshot.diagnostics).toMatchObject({ lorebookActivated: 30, lorebookSelected: 24 });
  });
});
