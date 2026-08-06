import { beforeEach, describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { MARKER } from "./constants.js";
import { buildLorebookContextSnapshot, buildParserContext, formatRecentContext, loadParserContextSources } from "./context.js";
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

  test("adds previous visual state to parser and preprocessing context only when enabled", async () => {
    const previousVisualState = {
      characters: [{
        name: "Jay",
        label: "boy",
        age: "",
        appearance: "short black hair, brown eyes",
        body: "slim",
        attire: "black school uniform",
        attireInferred: true
      }],
      environment: {
        location: "school clubroom",
        timeWeather: "late afternoon",
        lightingMood: ["warm window light"],
        backgroundElements: ["desks", "bookshelves"]
      },
      place: "",
      updatedAt: "2026-07-18T00:00:00.000Z"
    };
    const messages: ChatMessage[] = [{ id: "target", role: "assistant", content: "Current target." }];
    const enabled = await buildParserContext(
      "chat-1",
      messages,
      0,
      {},
      { ...DEFAULT_CONFIG, includeUserInfo: false, includeCharacterInfo: false, userInstructionsEnabled: false },
      0,
      "user-1",
      undefined,
      previousVisualState
    );
    const disabled = await buildParserContext(
      "chat-1",
      messages,
      0,
      {},
      {
        ...DEFAULT_CONFIG,
        previousVisualStateEnabled: false,
        includeUserInfo: false,
        includeCharacterInfo: false,
        userInstructionsEnabled: false
      },
      0,
      "user-1",
      undefined,
      previousVisualState
    );

    expect(enabled.systemContext).toContain("## Previous Visual State");
    expect(enabled.systemContext).toContain("late afternoon");
    expect(enabled.preprocessingSystemContext).toContain("black school uniform");
    expect(enabled.diagnostics.previousVisualState).toBe(true);
    expect(disabled.systemContext).not.toContain("Previous Visual State");
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


describe("Fast Mode parser context", () => {
  const characterCache = {
    Elara: "long silver hair, violet eyes, slim, blue robe"
  };
  const previousVisualState = {
    characters: [{ name: "Elara", label: "girl", age: "", appearance: "", body: "", attire: "", attireInferred: false }],
    environment: { location: "school clubroom", timeWeather: "late afternoon", lightingMood: ["warm window light"], backgroundElements: ["desks"] },
    place: "",
    updatedAt: "2026-07-18T00:00:00.000Z"
  };
  const fastConfig = {
    ...DEFAULT_CONFIG,
    fastMode: true,
    includeUserInfo: true,
    includeCharacterInfo: true,
    includeLorebook: true,
    userInstructionsEnabled: true,
    customParserInstructions: "Custom parser override.",
    characterTagContextEnabled: true,
    previousVisualStateEnabled: true
  };
  const messages: ChatMessage[] = [
    { id: "a1", role: "assistant", content: "Earlier narrative." },
    { id: "target", role: "assistant", content: "Current target." }
  ];

  test("skips recent history, lorebook, chat, persona, and metadata RPCs while keeping cached tags, previous visual state, and custom instructions", async () => {
    const calls: string[] = [];
    const spindleMock = (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle as Record<string, any>;
    spindleMock.chats.get = async () => { calls.push("chats.get"); return { id: "chat-1", character_id: "char-1" }; };
    spindleMock.personas.getActive = async () => { calls.push("personas.getActive"); return { id: "persona-1", name: "User", description: "profile" }; };
    spindleMock.characters.get = async () => { calls.push("characters.get"); return { id: "char-1", name: "Elara", description: "long silver hair" }; };
    spindleMock.world_books.getActivated = async () => { calls.push("world_books.getActivated"); return []; };

    const context = await buildParserContext("chat-1", messages, 1, characterCache, fastConfig, 0, "user-1", undefined, previousVisualState);

    expect(calls).toEqual([]);
    expect(activationCalls).toBe(0);
    expect(context.recentContext).toBe("");
    expect(context.systemContext).not.toContain("Earlier narrative");
    expect(context.systemContext).not.toContain("Lorebook");
    expect(context.systemContext).not.toContain("{{user}} Info");
    expect(context.systemContext).not.toContain("{{char}} Info");
    expect(context.systemContext).toContain("long silver hair, violet eyes");
    expect(context.systemContext).toContain("## Previous Visual State");
    expect(context.override).toContain("Custom parser override.");
    expect(context.override).not.toContain("profile");
    expect(context.diagnostics.fastMode).toBe(true);
  });

  test("bootstraps the character card once when Fast Mode has no durable character tags", async () => {
    const calls: string[] = [];
    const spindleMock = (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle as Record<string, any>;
    spindleMock.chats.get = async () => { calls.push("chats.get"); return { id: "chat-1", character_id: "char-1" }; };
    spindleMock.personas.getActive = async () => { calls.push("personas.getActive"); return { id: "persona-1" }; };
    spindleMock.characters.get = async () => { calls.push("characters.get"); return { id: "char-1", name: "Elara", description: "long silver hair" }; };
    spindleMock.world_books.getActivated = async () => { calls.push("world_books.getActivated"); return []; };

    const sources = await loadParserContextSources("chat-1", fastConfig, "user-1", { fastBootstrapCharacter: true });

    expect(calls).toEqual(["chats.get", "characters.get"]);
    expect(sources.chat).toMatchObject({ id: "chat-1" });
    expect(sources.character).toMatchObject({ id: "char-1" });
    expect(sources.persona).toBeNull();
    expect(sources.diagnostics.fastBootstrapCharacter).toBe(true);
  });

  test("does not load chat or character sources when durable character tags already exist", async () => {
    const calls: string[] = [];
    const spindleMock = (globalThis as typeof globalThis & { spindle: Record<string, unknown> }).spindle as Record<string, any>;
    spindleMock.chats.get = async () => { calls.push("chats.get"); return { id: "chat-1", character_id: "char-1" }; };
    spindleMock.characters.get = async () => { calls.push("characters.get"); return { id: "char-1" }; };

    const sources = await loadParserContextSources("chat-1", fastConfig, "user-1", { fastBootstrapCharacter: false });

    expect(calls).toEqual([]);
    expect(sources.chat).toBeNull();
    expect(sources.character).toBeNull();
    expect(sources.diagnostics.fastBootstrapCharacter).toBe(false);
  });
});
