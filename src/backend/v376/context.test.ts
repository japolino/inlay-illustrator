import { describe, expect, test } from "bun:test";
import {
  atbashCipher,
  base64Decode,
  base64Encode,
  buildNumberedText,
  buildV376Context,
  buildV376PreprocessContext,
  replaceRuntimeMacros,
  collectRecentCharMessages,
  decodeBase64Response,
  decodePlaceholders,
  decodeResponse,
  encodePrompt,
  getImmediateUserMessage,
  parsePrefillToMessages,
  tryDecodeBase64Text,
  V376ChatMessage,
} from "./context.js";
import { V376Options } from "./types.js";
import { SOURCE_SYSTEM_PROMPT } from "./data.js";

const baseOptions: V376Options = {
  mode: "illustration",
  nsfw: true,
  supplement: false,
  text: "off",
  quote: false,
  syntax: "nai",
  separator: "pipe",
  imageMin: 1,
  imageMax: 3,
  characterMax: 2,
  panelMin: 3,
  originalReference: false,
  originalCreationName: "{{char}}",
  encodingMode: "plain",
  prefillEnabled: false,
};

describe("V3.7.6 context encodings", () => {
  test("atbash cipher encodes and decodes symmetrically", () => {
    const original = "Hello World! 123 - { scenes: [] }";
    const encoded = atbashCipher(original);
    // H (72) -> 155-72 = 83 (S)
    // e (101) -> 219-101 = 118 (v)
    // l (108) -> 219-108 = 111 (o)
    // o (111) -> 219-111 = 108 (l)
    expect(encoded.startsWith("Svool Dliow!")).toBe(true);
    // Involutory roundtrip
    expect(atbashCipher(encoded)).toBe(original);
    expect(decodeResponse(encoded, "atbash")).toBe(original);
  });

  test("placeholder encoding resolves tokens when not in placeholder mode", () => {
    const textWithPlaceholders = "The character has BP1 and SE1.";
    // When mode is plain, encodePrompt resolves placeholders
    const resolved = encodePrompt(textWithPlaceholders, "plain");
    expect(resolved).toBe("The character has nipples and nsfw.");

    // When mode is placeholder, encodePrompt preserves placeholders
    const preserved = encodePrompt(textWithPlaceholders, "placeholder");
    expect(preserved).toBe(textWithPlaceholders);

    // decodePlaceholders resolves tokens
    expect(decodePlaceholders("BP1, BP2, BP10, SE1, SE20")).toBe(
      "nipples, areola, foreskin, nsfw, vaginal"
    );
  });

  test("base64 encoding and response decoding handles full payload and line-based output", () => {
    const sampleJson = JSON.stringify({ scenes: [{ place: "Room", shots: [] }] });
    const b64 = base64Encode(sampleJson);
    expect(base64Decode(b64)).toBe(sampleJson);
    expect(decodeResponse(b64, "base64")).toBe(sampleJson);

    // Mixed prefix lines + structured suffix
    const mixedOutput = `${b64}\n{"scenes": []}`;
    const decodedMixed = decodeBase64Response(mixedOutput);
    expect(decodedMixed.includes(sampleJson)).toBe(true);
  });
});

describe("V3.7.6 message scoping and preceding user pairing", () => {
  const chatHistory: V376ChatMessage[] = [
    { role: "user", content: "User greeting" }, // 0
    { role: "char", content: "Char greeting" }, // 1
    { role: "user", content: "User question" }, // 2
    { role: "char", content: "Char answer 1" }, // 3
    { role: "char", content: "Char answer 2 (unprompted)" }, // 4
    { role: "user", content: "User target instruction" }, // 5
    { role: "char", content: "Char target response" }, // 6 (TARGET)
    { role: "user", content: "Future user message (MUST NOT LEAK)" }, // 7
    { role: "char", content: "Future char message (MUST NOT LEAK)" }, // 8
  ];

  test("getImmediateUserMessage finds immediately preceding user message and stops before target", () => {
    // For target at 6: immediately preceding is 5 ("User target instruction")
    const immediate = getImmediateUserMessage(chatHistory, 6);
    expect(immediate).toBe("User target instruction");

    // For target at 4: immediately preceding is 3 (char), so no immediate user message
    const noImmediateUser = getImmediateUserMessage(chatHistory, 4);
    expect(noImmediateUser).toBe("");

    // For target at 0 (first message): returns empty string
    expect(getImmediateUserMessage(chatHistory, 0)).toBe("");
  });

  test("message scoping strictly prevents future leakage for an older target", () => {
    // Target is index 3 ("Char answer 1")
    const recent = collectRecentCharMessages(chatHistory, 3, 5, true);
    // Messages at or after index 3 (4, 5, 6, 7, 8) must NEVER appear
    const joined = recent.join(" ");
    expect(joined).not.toContain("Future user message");
    expect(joined).not.toContain("Future char message");
    expect(joined).not.toContain("User target instruction");
    expect(joined).not.toContain("Char target response");
    expect(joined).not.toContain("Char answer 2");

    // Only char message before index 3 is index 1 ("Char greeting"), paired with user at 0
    expect(recent.length).toBe(1);
    expect(recent[0]).toContain("User: User greeting");
    expect(recent[0]).toContain("Char: Char greeting");
  });

  test("collectRecentCharMessages handles zero history (includeCount = 0)", () => {
    const recent = collectRecentCharMessages(chatHistory, 6, 0, true);
    expect(recent).toEqual([]);
  });

  test("collectRecentCharMessages pairs preceding user message correctly", () => {
    // Target at 6, includeCount 2, includeUser true
    const recent = collectRecentCharMessages(chatHistory, 6, 2, true);
    expect(recent.length).toBe(2);
    // Most recent first: index 4 ("Char answer 2"), which has no user immediately preceding it
    expect(recent[0]).toBe("Char answer 2 (unprompted)");
    // Second most recent: index 3 ("Char answer 1"), preceded by user at 2 ("User question")
    expect(recent[1]).toContain("User: User question");
    expect(recent[1]).toContain("Char: Char answer 1");
  });
});

describe("V3.7.6 prefill parsing and transport", () => {
  test("parses standard and unclosed XML tags with attributes", () => {
    const xml = `<human id="H1">Please do X</human>
<assistant>Understood, master.</assistant>
<thoughts>Skip this internal note</thoughts>
<char>{"scenes": [`;

    const parsed = parsePrefillToMessages(xml);
    expect(parsed.length).toBe(3);
    expect(parsed[0].role).toBe("user");
    expect(parsed[0].content).toBe("Please do X");
    expect(parsed[0].id).toBe("H1");

    expect(parsed[1].role).toBe("char");
    expect(parsed[1].content).toBe("Understood, master.");

    // Thoughts skipped, unclosed <char> captured
    expect(parsed[2].role).toBe("char");
    expect(parsed[2].content).toBe('{"scenes": [');
  });

  test("appends prefill messages at the end of buildV376Context when prefillEnabled is true", () => {
    const optionsWithPrefill: V376Options = {
      ...baseOptions,
      prefillEnabled: true,
      encodingMode: "plain",
    };

    const paragraphs = [{ parserIndex: 1, originalIndex: 1, text: "Scene paragraph." }];
    const context = buildV376Context({
      targetMessageText: "Target narrative text.",
      paragraphs,
      messages: [{ role: "char", content: "Target narrative text." }],
      targetIndex: 0,
      options: optionsWithPrefill,
      includeCount: 0,
      prefillTemplate: `<human>Start</human><assistant>Understood</assistant>`,
    });

    const lastTwo = context.slice(-2);
    expect(lastTwo[0].role).toBe("user");
    expect(lastTwo[0].content).toBe("Start");
    expect(lastTwo[1].role).toBe("char");
    expect(lastTwo[1].content).toBe("Understood");
  });
});

describe("V3.7.6 numbered paragraph builder", () => {
  test("builds [P1] [P2] format accurately", () => {
    const paragraphs = [
      { parserIndex: 1, originalIndex: 1, text: "First block of text." },
      { parserIndex: 2, originalIndex: 2, text: "Second block of text." },
    ];
    const numbered = buildNumberedText(paragraphs);
    expect(numbered).toBe("[P1] First block of text.\n\n[P2] Second block of text.");
  });
});

describe("V3.7.6 macro replacement & leak prevention", () => {
  test("replaces user and char macros without undefined leaks", () => {
    const raw = "When pov is used, {{user}}'s viewpoint is key. {{char}} is in front. Creation: {{original}}.";
    const rendered = replaceRuntimeMacros(raw, {
      userName: "Alice",
      charName: "Bob",
      originalCreationName: "FantasyWorld",
    });
    expect(rendered).toBe("When pov is used, Alice's viewpoint is key. Bob is in front. Creation: FantasyWorld.");
    expect(rendered).not.toContain("{{user}}");
    expect(rendered).not.toContain("{{char}}");
    expect(rendered).not.toContain("{{original}}");
    expect(rendered).not.toContain("undefined");
  });

  test("uses safe fallbacks when macros are undefined, never outputting 'undefined'", () => {
    const raw = "POV: {{user}}, Char: {{char}}, Original: {{originalCreationName}}{{undefined}}";
    const rendered = replaceRuntimeMacros(raw, {});
    expect(rendered).toBe("POV: User, Char: Character, Original: ");
    expect(rendered).not.toContain("undefined");
    expect(rendered).not.toContain("{{");
  });

  test("buildV376Context safely replaces user and char info headings and text", () => {
    const paragraphs = [{ parserIndex: 1, originalIndex: 1, text: "Scene paragraph." }];
    const context = buildV376Context({
      targetMessageText: "Narrative text.",
      paragraphs,
      messages: [{ role: "char", content: "Narrative text." }],
      targetIndex: 0,
      options: { ...baseOptions, encodingMode: "plain" },
      includeCount: 0,
      userInfo: "User is a wandering adventurer.",
      charInfo: "Char is an ancient dragon.",
      userName: "Traveler",
      charName: "Draco",
    });

    const userMsg = context.find((m) => m.content.includes("Traveler Info"));
    const charMsg = context.find((m) => m.content.includes("Draco Info"));

    expect(userMsg).toBeDefined();
    expect(userMsg?.content).toContain("## Traveler Info");
    expect(userMsg?.content).not.toContain("{{user}}");

    expect(charMsg).toBeDefined();
    expect(charMsg?.content).toContain("## Draco Info");
    expect(charMsg?.content).not.toContain("{{char}}");
  });
});

describe("V3.7.6 preprocessing context construction", () => {
  test("builds preprocessing context with preceding user pairing and no future leakage", () => {
    const chatHistory: V376ChatMessage[] = [
      { role: "user", content: "What is your secret?" }, // 0
      { role: "char", content: "I guard the crystal." }, // 1
      { role: "user", content: "Can I touch it?" }, // 2
      { role: "char", content: "Touch it at your own risk." }, // 3 (TARGET)
      { role: "user", content: "Future user message" }, // 4 (FUTURE)
    ];
    const paragraphs = [{ parserIndex: 1, originalIndex: 1, text: "Alice reaches for the glowing crystal." }];

    const prepContext = buildV376PreprocessContext({
      paragraphs,
      messages: chatHistory,
      targetIndex: 3,
      options: { ...baseOptions, includeUserMessage: true, encodingMode: "plain" },
      includeCount: 1,
      includeUserChat: true,
      userName: "Hero",
      charName: "Guardian",
    });

    // Verify system protocol exists
    expect(prepContext[0].role).toBe("system");

    // Verify history contains paired message 1 and user 0
    const historyMsg = prepContext.find((m) => m.content.includes("## Previous Chat Context"));
    expect(historyMsg).toBeDefined();
    expect(historyMsg?.content).toContain("User: What is your secret?");
    expect(historyMsg?.content).toContain("Char: I guard the crystal.");
    expect(historyMsg?.content).not.toContain("Future user message");

    // Verify immediate user message is message 2
    const immUserMsg = prepContext.find((m) => m.content.includes("## Previous User Message"));
    expect(immUserMsg).toBeDefined();
    expect(immUserMsg?.content).toContain("Can I touch it?");
    expect(immUserMsg?.content).not.toContain("Future user message");

    // Verify user prompt contains numbered text
    const userPrompt = prepContext.find((m) => m.role === "user");
    expect(userPrompt).toBeDefined();
    expect(userPrompt?.content).toContain("[P1] Alice reaches for the glowing crystal.");
  });

  test("handles case-insensitive and whitespace prefill tags", () => {
    const xml = `<HUMAN id="U1" >Tell me a tale</human>\n<Assistant >Once upon a time...</assistant>`;
    const parsed = parsePrefillToMessages(xml);
    expect(parsed.length).toBe(2);
    expect(parsed[0].role).toBe("user");
    expect(parsed[0].content).toBe("Tell me a tale");
    expect(parsed[0].id).toBe("U1");
    expect(parsed[1].role).toBe("char");
    expect(parsed[1].content).toBe("Once upon a time...");
  });
});

describe("V3.7.6 initial system header parity across all encoding modes", () => {
  const modes: Array<"plain" | "placeholder" | "base64" | "atbash"> = [
    "plain",
    "placeholder",
    "base64",
    "atbash",
  ];

  for (const mode of modes) {
    test(`initial outgoing system header in mode '${mode}' equals SOURCE_SYSTEM_PROMPT exactly`, () => {
      const paragraphs = [{ parserIndex: 1, originalIndex: 1, text: "Sample paragraph." }];
      const context = buildV376Context({
        targetMessageText: "Target narrative.",
        paragraphs,
        messages: [{ role: "char", content: "Target narrative." }],
        targetIndex: 0,
        options: { ...baseOptions, encodingMode: mode },
        includeCount: 0,
      });

      // The very first message MUST always be the plaintext SOURCE_SYSTEM_PROMPT header per Lua buildBaseSharedChatData
      expect(context[0].role).toBe("system");
      expect(context[0].content).toBe(SOURCE_SYSTEM_PROMPT);
    });

    test(`initial preprocessing system header in mode '${mode}' equals SOURCE_SYSTEM_PROMPT exactly`, () => {
      const paragraphs = [{ parserIndex: 1, originalIndex: 1, text: "Sample paragraph." }];
      const prepContext = buildV376PreprocessContext({
        paragraphs,
        messages: [{ role: "char", content: "Target narrative." }],
        targetIndex: 0,
        options: { ...baseOptions, encodingMode: mode },
        includeCount: 0,
      });

      expect(prepContext[0].role).toBe("system");
      expect(prepContext[0].content).toBe(SOURCE_SYSTEM_PROMPT);
    });
  }
});

