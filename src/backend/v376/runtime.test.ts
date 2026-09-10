import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../../shared/config.js";
import type { GeneratedRecordSlot } from "../generated-record.js";
import type { PreparedParagraph } from "../types.js";
import {
  createV376PendingRecord,
  mapV376ShotsToJobs,
  prepareV376FreshReroll
} from "./runtime.js";
import type { V376CompiledShot, V376Options, V376Payload } from "./types.js";

describe("V3.7.6 Runtime adapter", () => {
  const sampleOptions: V376Options = {
    mode: "illustration",
    nsfw: false,
    supplement: false,
    text: "off",
    quote: false,
    syntax: "nai",
    separator: "pipe",
    imageMin: 1,
    imageMax: 3,
    characterMax: 5,
    panelMin: 1,
    originalReference: false,
    originalCreationName: ""
  };

  const sampleCompiledShots: V376CompiledShot[] = [
    {
      paragraph: 2, // parserIndex 2
      prompt: "masterpiece, 1girl, garden",
      negative: "lowres, bad anatomy",
      corePrompt: "1girl, garden",
      nativeCharacters: [
        { name: "Alice", prompt: "blonde hair, blue eyes", negative: "nsfw" }
      ],
      rawShot: {
        paragraph: 2,
        characters: [
          { name: "Alice", label: "1girl", age: "20", appearance: "blonde hair", attire: "dress" }
        ],
        quote: "Lovely day."
      },
      quote: "Lovely day."
    },
    {
      paragraph: 4, // parserIndex 4 -> originalIndex 7
      prompt: "masterpiece, 1boy, library",
      negative: "lowres",
      corePrompt: "1boy, library",
      rawShot: {
        paragraph: 4,
        placement: "cover",
        characters: []
      }
    }
  ];

  const sampleParagraphs: PreparedParagraph[] = [
    { parserIndex: 1, originalIndex: 1, text: "Intro" },
    { parserIndex: 2, originalIndex: 3, text: "In the garden" },
    { parserIndex: 3, originalIndex: 5, text: "Middle" },
    { parserIndex: 4, originalIndex: 7, text: "In the library" }
  ];

  test("mapV376ShotsToJobs correctly maps paragraph indexes to original document indexes", async () => {
    const jobs = await mapV376ShotsToJobs({
      compiledShots: sampleCompiledShots,
      paragraphs: sampleParagraphs,
      config: { ...DEFAULT_CONFIG, imageParameters: { seed: 12345 } },
      imageConnection: null,
      v376Options: sampleOptions
    });

    expect(jobs.length).toBe(2);

    // First shot: parserIndex 2 mapped to originalIndex 3
    expect(jobs[0]!.paragraph).toBe(3);
    expect(jobs[0]!.parserParagraph).toBe(2);
    expect(jobs[0]!.placement).toBe("paragraph");
    expect(jobs[0]!.quote).toBe("Lovely day.");

    // Characters carried through parameters
    expect(jobs[0]!.parameters.characters).toEqual([
      { prompt: "blonde hair, blue eyes", negative: "nsfw" }
    ]);
    expect(jobs[0]!.parameters.nativeCharacters).toEqual([
      { name: "Alice", prompt: "blonde hair, blue eyes", negative: "nsfw" }
    ]);

    // Second shot: raw comic placement is preserved as data, display placement remains "paragraph"
    expect(jobs[1]!.paragraph).toBe(7);
    expect(jobs[1]!.parserParagraph).toBe(4);
    expect(jobs[1]!.placement).toBe("paragraph");
    expect((jobs[1]!.rawShot as { placement?: string }).placement).toBe("cover");
    expect(jobs[1]!.parameters.characters).toBeUndefined();
  });

  test("createV376PendingRecord produces valid V3 structure with preserved metadata", async () => {
    const jobs = await mapV376ShotsToJobs({
      compiledShots: sampleCompiledShots,
      paragraphs: sampleParagraphs,
      config: DEFAULT_CONFIG,
      imageConnection: null,
      v376Options: sampleOptions
    });

    const payload: V376Payload = {
      scenes: [
        {
          place: "city",
          shots: sampleCompiledShots.map((s) => s.rawShot)
        }
      ]
    };

    const record = createV376PendingRecord({
      chatId: "chat-1",
      messageId: "msg-1",
      swipeId: 0,
      sourceFingerprint: "fp-123",
      operationId: "op-456",
      jobs,
      payload,
      options: sampleOptions
    });

    expect(record.schemaVersion).toBe(3);
    expect(record.chatId).toBe("chat-1");
    expect(record.generationStatus).toBe("pending");
    expect(record.slots.length).toBe(2);
    expect(record.slots[0]!.status).toBe("pending");
    expect(record.slots[0]!.paragraph).toBe(3);
    expect(record.slots[0]!.nativeCharacters).toEqual([
      { name: "Alice", prompt: "blonde hair, blue eyes", negative: "nsfw" }
    ]);
    expect(record.v376Payload).toEqual(payload);
    expect(record.v376Options).toEqual(sampleOptions);
  });

  test("prepareV376FreshReroll preserves native character channels", async () => {
    const slot: GeneratedRecordSlot = {
      prompt: "masterpiece, 1girl, garden",
      negativePrompt: "lowres",
      perspectiveMode: "dynamic",
      perspectiveSource: "manual",
      paragraph: 3,
      imageId: "img-1",
      imageUrl: "http://example.com/img-1.png",
      placement: "paragraph",
      status: "completed",
      corePrompt: "1girl, garden",
      nativeCharacters: [
        { name: "Alice", prompt: "blonde hair, blue eyes", negative: "nsfw" }
      ],
      imageParameters: {
        seed: 42,
        characters: [{ prompt: "blonde hair, blue eyes", negative: "nsfw" }]
      }
    };

    const reroll = await prepareV376FreshReroll({
      slot,
      config: DEFAULT_CONFIG,
      imageConnection: null
    });

    expect(reroll.parameters.seed).toBeDefined();
    expect(reroll.parameters.seed).not.toBe(42); // Fresh seed generated
    expect(reroll.parameters.characters).toEqual([
      { prompt: "blonde hair, blue eyes", negative: "nsfw" }
    ]);
    expect(reroll.parameters.nativeCharacters).toEqual([
      { name: "Alice", prompt: "blonde hair, blue eyes", negative: "nsfw" }
    ]);
  });

  test("prepareV376FreshReroll documents legacy fallback without fabricating channels", async () => {
    // Legacy slot without nativeCharacters
    const legacySlot: GeneratedRecordSlot = {
      prompt: "masterpiece, 1girl, solo, outdoors",
      negativePrompt: "lowres",
      perspectiveMode: "dynamic",
      perspectiveSource: "manual",
      paragraph: 1,
      imageId: "img-old",
      imageUrl: "http://example.com/old.png",
      placement: "paragraph",
      status: "completed",
      imageParameters: { seed: 100 }
    };

    const reroll = await prepareV376FreshReroll({
      slot: legacySlot,
      config: DEFAULT_CONFIG,
      imageConnection: null
    });

    expect(reroll.prompt).toBe("masterpiece, 1girl, solo, outdoors");
    expect(reroll.parameters.characters).toBeUndefined();
    expect(reroll.parameters.nativeCharacters).toBeUndefined();
    expect(reroll.parameters.seed).toBeDefined();
  });

  test("prepareV376FreshReroll recompiles rawShot with latest affixes and scenePlace", async () => {
    const rawShotSlot: GeneratedRecordSlot = {
      prompt: "old compiled prompt",
      negativePrompt: "old negative",
      perspectiveMode: "dynamic",
      perspectiveSource: "manual",
      paragraph: 1,
      imageId: "img-raw",
      imageUrl: "http://example.com/raw.png",
      placement: "paragraph",
      status: "completed",
      scenePlace: "ancient ruins",
      rawShot: {
        paragraph: 1,
        camera: "wide shot",
        scene: "stone pillars",
        characters: [
          { name: "Celia", label: "girl", age: "", appearance: "silver hair", attire: "white robe" }
        ]
      },
      imageParameters: { seed: 999 }
    };

    const latestConfig = {
      ...DEFAULT_CONFIG,
      customPositivePrefix: "masterpiece, ultra-detailed",
      customNegative: "worst quality"
    };

    const reroll = await prepareV376FreshReroll({
      slot: rawShotSlot,
      config: latestConfig,
      imageConnection: null
    });

    // Verify raw shot recompiled with latest affixes and scenePlace
    expect(reroll.prompt).toContain("masterpiece, ultra-detailed");
    expect(reroll.prompt).toContain("ancient ruins");
    expect(reroll.prompt).toContain("silver hair");
    expect(reroll.negative).toContain("worst quality");
    expect(reroll.parameters.seed).not.toBe(999);
  });

  test("prepareV376FreshReroll clears stale native characters when switching native to pipe", async () => {
    // Original slot was generated with native mode and had parameters.characters
    const slot: GeneratedRecordSlot = {
      prompt: "masterpiece, 1girl, garden",
      negativePrompt: "lowres",
      perspectiveMode: "dynamic",
      perspectiveSource: "manual",
      paragraph: 1,
      imageId: "img-1",
      imageUrl: "http://example.com/1.png",
      placement: "paragraph",
      status: "completed",
      rawShot: {
        paragraph: 1,
        characters: [
          { name: "Alice", label: "girl", age: "", appearance: "blonde hair", attire: "dress" }
        ]
      },
      nativeCharacters: [{ name: "Alice", prompt: "blonde hair", negative: "nsfw" }],
      imageParameters: {
        seed: 42,
        characters: [{ prompt: "blonde hair", negative: "nsfw" }],
        nativeCharacters: [{ name: "Alice", prompt: "blonde hair", negative: "nsfw" }]
      }
    };

    // User switches promptSeparator to "pipe"
    const pipeConfig = {
      ...DEFAULT_CONFIG,
      promptSeparator: "pipe" as const,
    };

    const reroll = await prepareV376FreshReroll({
      slot,
      config: pipeConfig,
      imageConnection: null
    });

    // In pipe mode, native characters must be stripped from parameters
    expect(reroll.parameters.characters).toBeUndefined();
    expect(reroll.parameters.nativeCharacters).toBeUndefined();
    expect(reroll.nativeCharacters).toBeUndefined();
    expect(reroll.prompt).toContain("blonde hair");
  });

  test("prepareV376FreshReroll applies appearanceMap negative tags during rawShot recompilation", async () => {
    const slot: GeneratedRecordSlot = {
      prompt: "masterpiece, 1girl, garden",
      negativePrompt: "lowres",
      perspectiveMode: "dynamic",
      perspectiveSource: "manual",
      paragraph: 1,
      imageId: "img-1",
      imageUrl: "http://example.com/1.png",
      placement: "paragraph",
      status: "completed",
      rawShot: {
        paragraph: 1,
        characters: [
          { name: "Alice", label: "girl", age: "", appearance: "blonde hair", attire: "dress" }
        ]
      },
      imageParameters: { seed: 10 }
    };

    const nativeConfig = {
      ...DEFAULT_CONFIG,
      promptSeparator: "native" as const,
      promptSyntax: "nai" as const,
    };

    const reroll = await prepareV376FreshReroll({
      slot,
      config: nativeConfig,
      imageConnection: null,
      appearanceMap: {
        Alice: { tags: "blonde hair", negTags: "dark skin, horns" }
      }
    });

    expect(reroll.parameters.characters).toBeDefined();
    expect(reroll.nativeCharacters?.[0]?.negative).toContain("dark skin, horns");
  });
});
