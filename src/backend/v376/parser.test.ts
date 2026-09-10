import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../../shared/config.js";
import type { Config } from "../../shared/config.js";
import { atbashCipher, base64Encode, type V376ChatMessage, type V376OutboundMessage } from "./context.js";
import { parseV376ForMessage } from "./parser.js";
import type { PreparedParagraph, State } from "../types.js";

function createMockConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    parserConnectionId: "mock-conn-id",
    parserModel: "mock-model",
    minImages: 1,
    maxImages: 3,
    includeMinMessages: 0,
    includeMaxMessages: 2,
    parserRetries: 1,
    ...overrides,
  };
}

function createMockState(): State {
  return {
    characterAppearance: {},
    manualCharacterAppearance: {},
  } as unknown as State;
}

const mockParagraphs: PreparedParagraph[] = [
  { parserIndex: 1, originalIndex: 1, text: "Alice walks into the garden." },
  { parserIndex: 2, originalIndex: 2, text: "She looks around at the blooming roses." },
];

const mockValidJson = JSON.stringify({
  scenes: [
    {
      place: "Garden",
      shots: [
        {
          paragraph: 1,
          camera: "wide shot",
          situation: "daytime garden",
          characters: [
            {
              name: "Alice",
              label: "young woman",
              age: "20yo",
              appearance: "blonde hair, blue eyes",
              attire: "white sundress",
              action: "walking",
            },
          ],
        },
      ],
    },
  ],
});

describe("V3.7.6 parser request & compilation runtime", () => {
  test("successfully parses valid response and compiles shots without ANIMA passes", async () => {
    const config = createMockConfig();
    const state = createMockState();
    let invokedCount = 0;

    const mockInvoker = async (messages: V376OutboundMessage[]) => {
      invokedCount++;
      return mockValidJson;
    };

    const result = await parseV376ForMessage({
      chatId: "test-chat",
      messageId: "msg-1",
      messages: [{ id: "msg-1", role: "char", content: "Alice in garden." }],
      paragraphs: mockParagraphs,
      state,
      config,
      llmInvoker: mockInvoker,
    });

    expect(invokedCount).toBe(1);
    expect(result.payload.scenes.length).toBe(1);
    expect(result.compiled.length).toBe(1);
    expect(result.compiled[0].paragraph).toBe(1);
    expect(result.compiled[0].prompt).toContain("blonde hair");
    expect(result.compiled[0].prompt).toContain("white sundress");

    // Memory was updated
    expect(state.characterAppearance.Alice).toContain("blonde hair");

    // Verify rawShot is untouched by old camera repair or creative concepts
    expect(result.compiled[0].rawShot.camera).toBe("wide shot");
    const rawChar = result.compiled[0].rawShot.characters[0] as any;
    expect(rawChar.sources).toBeUndefined(); // no provenance schema
    expect(rawChar.visibleTags).toBeUndefined(); // no visibility projection
  });

  test("retries with escalated context inclusion on blank or failed JSON", async () => {
    const config = createMockConfig({
      includeMinMessages: 0,
      includeMaxMessages: 2,
      parserRetries: 2,
    });
    const state = createMockState();
    const includesSeen: number[] = [];

    const messages = [
      { role: "char", content: "Previous message 1" },
      { role: "char", content: "Previous message 2" },
      { id: "target-msg", role: "char", content: "Target message" },
    ];

    const mockInvoker = async (outbound: V376OutboundMessage[]) => {
      // Find if history system message exists and count items
      const hist = outbound.find((m) => m.content.includes("## Previous Character Messages"));
      if (!hist) {
        includesSeen.push(0);
      } else {
        const matches = hist.content.match(/\[History \d+\]/g);
        includesSeen.push(matches ? matches.length : 0);
      }

      if (includesSeen.length === 1) {
        return ""; // blank response triggers retry
      } else if (includesSeen.length === 2) {
        return "Not valid JSON"; // parse error triggers retry
      } else {
        return mockValidJson; // success on 3rd attempt
      }
    };

    const result = await parseV376ForMessage({
      chatId: "test-chat",
      messageId: "target-msg",
      messages,
      paragraphs: mockParagraphs,
      state,
      config,
      llmInvoker: mockInvoker,
    });

    expect(result.payload.scenes.length).toBe(1);
    // Escalation verified: attempt 0 had 0, attempt 1 had 1, attempt 2 had 2
    expect(includesSeen).toEqual([0, 1, 2]);
  });

  test("surfaces provider error when retries are exhausted", async () => {
    const config = createMockConfig({ parserRetries: 1 });
    const state = createMockState();

    const failingInvoker = async () => {
      throw new Error("Provider API connection timeout 504");
    };

    await expect(
      parseV376ForMessage({
        chatId: "test-chat",
        messageId: "msg-1",
        messages: [{ id: "msg-1", role: "char", content: "Text" }],
        paragraphs: mockParagraphs,
        state,
        config,
        llmInvoker: failingInvoker,
      })
    ).rejects.toThrow("Provider API connection timeout 504");
  });

  test("preserves cancellation and throws immediately when signal is aborted", async () => {
    const config = createMockConfig({ parserRetries: 2 });
    const state = createMockState();
    const controller = new AbortController();

    const slowInvoker = async () => {
      controller.abort("User clicked Stop");
      throw new Error("Aborted");
    };

    await expect(
      parseV376ForMessage({
        chatId: "test-chat",
        messageId: "msg-1",
        messages: [{ id: "msg-1", role: "char", content: "Text" }],
        paragraphs: mockParagraphs,
        state,
        config,
        signal: controller.signal,
        llmInvoker: slowInvoker,
      })
    ).rejects.toThrow();
  });

  test("decodes Base64-encoded LLM response", async () => {
    const config = createMockConfig({ encodingMode: "base64" });
    const state = createMockState();

    const b64Json = base64Encode(mockValidJson);
    const mockInvoker = async () => b64Json;

    const result = await parseV376ForMessage({
      chatId: "test-chat",
      messageId: "msg-1",
      messages: [{ id: "msg-1", role: "char", content: "Text" }],
      paragraphs: mockParagraphs,
      state,
      config,
      llmInvoker: mockInvoker,
    });

    expect(result.payload.scenes.length).toBe(1);
    expect(result.compiled[0].prompt).toContain("blonde hair");
  });

  test("decodes Atbash-encoded LLM response", async () => {
    const config = createMockConfig({ encodingMode: "atbash" });
    const state = createMockState();

    const atbashJson = atbashCipher(mockValidJson);
    const mockInvoker = async () => atbashJson;

    const result = await parseV376ForMessage({
      chatId: "test-chat",
      messageId: "msg-1",
      messages: [{ id: "msg-1", role: "char", content: "Text" }],
      paragraphs: mockParagraphs,
      state,
      config,
      llmInvoker: mockInvoker,
    });

    expect(result.payload.scenes.length).toBe(1);
    expect(result.compiled[0].prompt).toContain("blonde hair");
  });

  test("tolerates fuzzy JSON keys via Levenshtein matching without semantic rewriting", async () => {
    const config = createMockConfig();
    const state = createMockState();

    // Misspelled keys: "scens" -> "scenes", "shot" -> "shots", "paragragh" -> "paragraph", "camra" -> "camera"
    const fuzzyJson = JSON.stringify({
      scens: [
        {
          place: "Courtyard",
          shot: [
            {
              paragragh: 1,
              camra: "medium shot",
              situation: "sunny afternoon",
              characters: [
                {
                  name: "Bob",
                  label: "young man",
                  age: "25yo",
                  appearance: "black hair, brown eyes",
                  attire: "formal suit",
                },
              ],
            },
          ],
        },
      ],
    });

    const mockInvoker = async () => fuzzyJson;

    const result = await parseV376ForMessage({
      chatId: "test-chat",
      messageId: "msg-1",
      messages: [{ id: "msg-1", role: "char", content: "Narrative" }],
      paragraphs: mockParagraphs,
      state,
      config,
      llmInvoker: mockInvoker,
    });

    expect(result.payload.scenes.length).toBe(1);
    expect(result.compiled.length).toBe(1);
    expect(result.compiled[0].paragraph).toBe(1);
    expect(result.compiled[0].rawShot.camera).toBe("medium shot");
    expect(result.compiled[0].prompt).toContain("black hair");
  });

  test("runs preprocessing with user pairing and injects preprocessed analysis into main prompt", async () => {
    const config = createMockConfig({
      preprocessingEnabled: true,
      includeUserMessage: true,
    });
    const state = createMockState();

    let preprocessInvoked = false;
    let mainInvoked = false;

    const mockInvoker = async (outbound: V376OutboundMessage[]) => {
      // Check if this is preprocessing or main prompt
      const isPreprocess = outbound.some((m) =>
        m.role === "user" && m.content.includes("## Scene Tagging")
      );

      if (isPreprocess) {
        preprocessInvoked = true;
        // Verify user pairing in preprocessing context
        const userMsg = outbound.find((m) => m.content.includes("## Previous User Message"));
        expect(userMsg).toBeDefined();
        expect(userMsg?.content).toContain("What do you see?");

        // Preprocessing response with keyword needing replacement (loli -> young girl)
        return "[Appearance: Alice: blonde hair, loli]\n[P1]: Garden, wide shot, Alice walking.";
      } else {
        mainInvoked = true;
        // Verify that preprocessed analysis was injected into main prompt with keyword replaced!
        const userMsg = outbound.find((m) => m.role === "user");
        expect(userMsg?.content).toContain("## Preprocessed Analysis");
        expect(userMsg?.content).toContain("young girl"); // loli replaced
        expect(userMsg?.content).not.toContain("loli");

        return mockValidJson;
      }
    };

    const messages: V376ChatMessage[] = [
      { role: "user", content: "What do you see?" },
      { id: "target-msg", role: "char", content: "I see a blooming garden." },
    ];

    const result = await parseV376ForMessage({
      chatId: "test-chat",
      messageId: "target-msg",
      messages,
      paragraphs: mockParagraphs,
      state,
      config,
      userName: "Explorer",
      charName: "Guide",
      llmInvoker: mockInvoker,
    });

    expect(preprocessInvoked).toBe(true);
    expect(mainInvoked).toBe(true);
    expect(result.payload.scenes.length).toBe(1);
  });

  test("preserves activePromptPresetId, template fields, and appearance negative tags into compiler", async () => {
    const config = createMockConfig({
      activePromptPresetId: "cinematic-preset",
      promptPresets: [
        {
          id: "cinematic-preset",
          name: "Cinematic",
          positivePrefix: "masterpiece, 8k wallpaper",
          negativePrefix: "lowres, artifacts",
        },
      ],
      customPositivePrefix: "artist:cutesexyrobutts",
      customPositiveSuffix: "vibrant colors",
      customNegative: "watermark, signature",
      promptSeparator: "pipe",
      promptSyntax: "nai",
    });

    // State with character appearance negative tag for Alice
    const state = createMockState();
    state.characterAppearance = {
      Alice: "blonde hair, blue eyes|||deformed fingers|||5",
    };

    const mockInvoker = async () => mockValidJson;

    const result = await parseV376ForMessage({
      chatId: "test-chat",
      messageId: "msg-1",
      messages: [{ id: "msg-1", role: "char", content: "Alice in garden." }],
      paragraphs: mockParagraphs,
      state,
      config,
      llmInvoker: mockInvoker,
    });

    const compiledShot = result.compiled[0];
    expect(compiledShot).toBeDefined();

    // customPos (customPositivePrefix) prepended
    expect(compiledShot.prompt).toContain("artist:cutesexyrobutts");

    // customNeg (customPositiveSuffix) appended to positive
    expect(compiledShot.prompt).toContain("vibrant colors");

    // activePromptPresetId positive prefix integrated
    expect(compiledShot.prompt).toContain("masterpiece, 8k wallpaper");

    // negative tags contain preset negativePrefix and customNegative
    expect(compiledShot.negative).toContain("lowres, artifacts");
    expect(compiledShot.negative).toContain("watermark, signature");
  });

  test("decodes placeholder tokens when compiling in placeholder mode", async () => {
    const config = createMockConfig({
      encodingMode: "placeholder",
    });
    const state = createMockState();

    // LLM outputs JSON containing BP1 (nipples) and SE1 (nsfw)
    const placeholderJson = JSON.stringify({
      scenes: [
        {
          place: "Beach",
          shots: [
            {
              paragraph: 1,
              camera: "close-up",
              situation: "1girl, SE1",
              characters: [
                {
                  name: "Siren",
                  label: "woman",
                  age: "22yo",
                  appearance: "teal hair, BP1 visible",
                  attire: "bikini",
                },
              ],
            },
          ],
        },
      ],
    });

    const mockInvoker = async () => placeholderJson;

    const result = await parseV376ForMessage({
      chatId: "test-chat",
      messageId: "msg-1",
      messages: [{ id: "msg-1", role: "char", content: "Siren at beach." }],
      paragraphs: mockParagraphs,
      state,
      config,
      llmInvoker: mockInvoker,
    });

    const shot = result.compiled[0];
    // In compiled prompt, BP1 is decoded to nipples, SE1 is decoded to nsfw
    expect(shot.prompt).toContain("nipples visible");
    expect(shot.prompt).toContain("nsfw");
    expect(shot.prompt).not.toContain("BP1");
    expect(shot.prompt).not.toContain("SE1");
  });


describe("V3.7.6 real Spindle invocation path & host source integration", () => {
  test("loads host sources (persona, character, lorebooks), preserves token parameters, and invokes Spindle without custom invoker", async () => {
    const rawRequests: any[] = [];

    // Mock globalThis.spindle with full real API surface
    (globalThis as any).spindle = {
      connections: {
        get: async (id: string) => ({ id, name: "OpenAI GPT-4o", provider: "openai", model: "gpt-4o" }),
      },
      chats: {
        get: async (chatId: string) => ({
          id: chatId,
          character_id: "char-elena",
          metadata: { Inlay: { extra: "Chat metadata extra instruction." } },
        }),
      },
      personas: {
        getActive: async () => ({
          name: "Lyra",
          title: "Star Wanderer",
          description: "A curious traveler exploring astral mysteries.",
          metadata: { inlay: { extra: "Persona extra instruction." } },
        }),
      },
      characters: {
        get: async (id: string) => ({
          id,
          name: "Elena",
          description: "Guardian of the sanctuary.",
          personality: "Calm, protective, observant.",
          scenario: "Ancient temple inner sanctum.",
          creator_notes: "Always carries an amber staff.",
          tags: ["guardian", "sanctuary", "amber staff"],
          extensions: { Inlay: { extra: "Character extra instruction." } },
        }),
      },
      world_books: {
        getActivated: async (chatId: string) => [
          { id: "lore-amber", comment: "Amber Lore", keys: ["amber", "sanctuary"] },
        ],
        entries: {
          get: async (id: string) => ({
            id,
            comment: "Amber Lore",
            content: "The amber staff channels solar energy into radiant light.",
          }),
        },
      },
      generate: {
        raw: async (request: any) => {
          rawRequests.push(request);
          if (rawRequests.length === 1 && request.messages.some((m: any) => m.content.includes("## Scene Tagging"))) {
            // Preprocessing response (prose, not JSON)
            return "[Appearance: Elena: silver hair, amber staff]\n[P1]: Sanctuary, wide shot, Elena holding staff.";
          }
          // Main parser response
          return JSON.stringify({
            scenes: [
              {
                place: "Sanctuary",
                shots: [
                  {
                    paragraph: 1,
                    camera: "wide shot",
                    situation: "sanctuary interior",
                    characters: [
                      {
                        name: "Elena",
                        label: "guardian woman",
                        age: "24yo",
                        appearance: "silver hair, golden eyes, amber staff",
                        attire: "ceremonial robe",
                      },
                    ],
                  },
                ],
              },
            ],
          });
        },
      },
    };

    const config = createMockConfig({
      includeUserInfo: true,
      includeCharacterInfo: true,
      includeLorebook: true,
      userInstructionsEnabled: true,
      preprocessingEnabled: true,
      customParserInstructions: "Client custom rule: preserve serene atmosphere.",
      parserParameters: {
        max_tokens: 3072, // Explicit parameter must NOT be overridden by parserMaxTokens!
        temperature: 0.7,
      },
    });

    const state = createMockState();
    const messages: V376ChatMessage[] = [
      { id: "msg-0", role: "user", content: "Enter the sanctuary." },
      { id: "msg-1", role: "char", content: "Elena steps forward, amber staff in hand." },
    ];

    // Invoke parseV376ForMessage WITHOUT passing custom llmInvoker or hardcoded names!
    const result = await parseV376ForMessage({
      chatId: "chat-sanctuary",
      messageId: "msg-1",
      messages,
      paragraphs: mockParagraphs,
      state,
      config,
    });

    expect(result.payload.scenes.length).toBe(1);
    expect(result.compiled[0].prompt).toContain("silver hair");

    // Verify raw requests passed to Spindle
    expect(rawRequests.length).toBe(2); // Preprocess + Main

    const prepReq = rawRequests[0];
    const mainReq = rawRequests[1];

    // 1. Explicit max_tokens preserved
    expect(prepReq.parameters.max_tokens).toBe(3072);
    expect(mainReq.parameters.max_tokens).toBe(3072);

    // 2. Preprocessing prose does NOT force response_format json_object
    expect(prepReq.parameters.response_format).toBeUndefined();

    // 3. Per Lua runtime fidelity, no automatic response_format injection
    expect(mainReq.parameters.response_format).toBeUndefined();

    // 4. Outbound message roles strictly "system" | "user" | "assistant" (no "char")
    for (const req of rawRequests) {
      for (const m of req.messages) {
        expect(["system", "user", "assistant"]).toContain(m.role);
      }
    }

    // 5. Host sources verified in main request:
    const sysMessages = mainReq.messages.filter((m: any) => m.role === "system");
    const allSysText = sysMessages.map((m: any) => m.content).join("\n\n");

    // Persona name and info loaded
    expect(allSysText).toContain("## Lyra Info");
    expect(allSysText).toContain("Star Wanderer");

    // Character name and info loaded
    expect(allSysText).toContain("## Elena Info");
    expect(allSysText).toContain("Guardian of the sanctuary");

    // Lorebook content loaded without truncation
    expect(allSysText).toContain("The amber staff channels solar energy into radiant light.");

    // Instructions override combines customParserInstructions and userInstructionsEnabled metadata
    const userMessages = mainReq.messages.filter((m: any) => m.role === "user");
    const overrideMsg = userMessages.find((m: any) => m.content.includes("# Priority: Instructions Override"));
    expect(overrideMsg).toBeDefined();
    expect(overrideMsg?.content).toContain("Client custom rule: preserve serene atmosphere.");
    expect(overrideMsg?.content).toContain("Persona extra instruction.");
    expect(overrideMsg?.content).toContain("Character extra instruction.");
    expect(overrideMsg?.content).toContain("Chat metadata extra instruction.");

    // Clean up mock
    delete (globalThis as any).spindle;
  });

  test("preserves explicit max_completion_tokens on parserParameters without forcing max_tokens", async () => {
    let capturedParams: any = null;

    (globalThis as any).spindle = {
      connections: {
        get: async (id: string) => ({ id, provider: "openai", model: "o1-mini" }),
      },
      chats: { get: async () => null },
      personas: { getActive: async () => null },
      characters: { get: async () => null },
      world_books: { getActivated: async () => [] },
      generate: {
        raw: async (request: any) => {
          capturedParams = request.parameters;
          return mockValidJson;
        },
      },
    };

    const config = createMockConfig({
      parserParameters: {
        max_completion_tokens: 16384,
      },
    });

    const state = createMockState();
    await parseV376ForMessage({
      chatId: "chat-tokens",
      messageId: "msg-1",
      messages: [{ id: "msg-1", role: "char", content: "Narrative" }],
      paragraphs: mockParagraphs,
      state,
      config,
    });

    expect(capturedParams).toBeDefined();
    expect(capturedParams.max_completion_tokens).toBe(16384);
    expect(capturedParams.max_tokens).toBeUndefined();

    delete (globalThis as any).spindle;
  });
});

});
