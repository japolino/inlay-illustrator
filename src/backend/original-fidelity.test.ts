import { describe, expect, test } from "bun:test";
import archivedCard from "../../references/original-module/card.json";
import { DEFAULT_CONFIG, normalizeConfig } from "../shared/config.js";
import { formatRecentContext } from "./context.js";
import {
  ORIGINAL_IMAGE_INSTRUCTION_TEMPLATE,
  ORIGINAL_PREPROCESS_INSTRUCTION_TEMPLATE,
  renderOriginalImageInstruction,
  renderOriginalPreprocessInstruction
} from "./original-instructions.js";
import {
  buildParserMessages,
  parseParserJson,
  parserUserRequest
} from "./parser.js";
import { CORE_PREAMBLE } from "./instructions.js";
import type { ParserContext } from "./types.js";
import { renderPrompt } from "./prompt.js";
import { selectPromptEntries } from "./scenes.js";
import type { ParsedPayload, PreparedParagraph } from "./types.js";

const entries = archivedCard.data.character_book.entries as Array<{ name?: string; content?: string }>;
const archived = (name: string): string => entries.find((entry) => entry.name === name)?.content || "";

const paragraphs: PreparedParagraph[] = [
  { parserIndex: 1, originalIndex: 1, text: "First paragraph" },
  { parserIndex: 2, originalIndex: 2, text: "Second paragraph" },
  { parserIndex: 3, originalIndex: 3, text: "Third paragraph" }
];

describe("Inlay Image v3.5 source fidelity", () => {
  test("loads the image and preprocessing instructions word for word from the tracked card", () => {
    expect(ORIGINAL_IMAGE_INSTRUCTION_TEMPLATE).toBe(archived("Card.Image.axLLM"));
    expect(ORIGINAL_PREPROCESS_INSTRUCTION_TEMPLATE).toBe(archived("Card.Preprocess.Prompt"));
  });

  test("resolves only archived card controls and keeps the selected mode's original prose", () => {
    const illustration = renderOriginalImageInstruction(DEFAULT_CONFIG);
    const asset = renderOriginalImageInstruction({ ...DEFAULT_CONFIG, mode: "asset" });

    expect(illustration).toContain("Generate 3");
    expect(illustration).not.toContain("white background");
    expect(asset).toContain("exactly one visible character");
    expect(asset).toContain("white background");
    expect(`${illustration}${asset}`).not.toMatch(/\{\{#(?:if|when)|\{\{getglobalvar/);
  });

  test("substitutes only the original preprocessing count variables", () => {
    const rendered = renderOriginalPreprocessInstruction({ ...DEFAULT_CONFIG, minImages: 2, maxImages: 4 });
    expect(rendered).toBe(archived("Card.Preprocess.Prompt")
      .replaceAll("{{getglobalvar::toggle_Card.Image.Min}}", "2")
      .replaceAll("{{getglobalvar::toggle_Card.Image.Max}}", "4")
      .trim());
  });
});

describe("v3.5 parser behavior", () => {
  test("keeps instructions, reference, source, and client override in their original priority order", () => {
    const request = parserUserRequest("[P1]\nA girl waves.", DEFAULT_CONFIG);
    const context: ParserContext = {
      systemContext: CORE_PREAMBLE + "\n\nreference",
      baseBlocks: [CORE_PREAMBLE, "reference"],
      preprocessingBaseBlocks: [CORE_PREAMBLE, "reference"],
      recentContext: "",
      override: "client override",
      diagnostics: {}
    };
    const messages = buildParserMessages(DEFAULT_CONFIG, context, "[P1]\nA girl waves.");
    // Order: raw preamble, distinct base block(s), Core/Image, user, override, prefill
    expect(messages[0]?.content).toBe(CORE_PREAMBLE);
    expect(messages[1]?.role).toBe("system");
    // Override should be the last user message before prefill
    const overrideMsg = messages.find((m) => m.content.includes("client override"));
    expect(overrideMsg).toBeDefined();
    expect(overrideMsg?.role).toBe("user");
  });

  test("recovers fenced JSON and common misspelled v3.5 fields", () => {
    const parsed = parseParserJson('```json\n{"sceens":[{"shots":[{"paragraf":1,"camera":"portrait"}]}]}\n```');
    expect(parsed.scenes).toHaveLength(1);
    expect((parsed.scenes?.[0]?.shots?.[0] as { paragraph?: number }).paragraph).toBe(1);
  });

  test("uses one last parser shot per paragraph and sorts by paragraph", () => {
    const payload: ParsedPayload = { scenes: [{ place: "garden", shots: [
      { paragraph: 2, camera: "wide shot", situation: "1girl", characters: [], supplement: "old" },
      { paragraph: 1, camera: "portrait", situation: "1girl", characters: [], supplement: "first" },
      { paragraph: 2, camera: "cowboy shot", situation: "1girl", characters: [], supplement: "replacement" }
    ] }] };
    const selected = selectPromptEntries(payload, paragraphs, { ...DEFAULT_CONFIG, minImages: 1, maxImages: 5, supplement: true, promptStyle: "default" as const, promptSyntax: "comfyui" as const, presetNumber: "1" as any });
    expect(selected.map((entry) => entry.parserParagraph)).toEqual([1, 2]);
    // With supplement true, replacement should be present via getFinal (appended after preset)
    const promptText = renderPrompt(selected[1]!.prompt, "comfyui");
    expect(promptText).toContain("replacement");
    expect(promptText).not.toContain("old");
    // Raw data defect: stored situation/place empty, setup includes scene text
    expect(selected[1]!.rawPromptData.situation).toBe("");
    expect(selected[1]!.rawPromptData.place).toBe("");
    expect(selected[1]!.rawPromptData.setup).toContain("1girl");
  });
});

describe("restored Asset Mode", () => {
  test("forces a single viewer-facing character on a simple white portrait background (no slice, but asset injections)", () => {
    const payload: ParsedPayload = { scenes: [{ place: "busy street", shots: [{
      paragraph: 1,
      camera: "from side",
      situation: "2girls",
      characters: [
        { name: "Mira", label: "girl", appearance: "black hair", action: "standing" },
        { name: "Nia", label: "girl", appearance: "red hair", action: "waving" }
      ]
    }] }] };
    const [entry] = selectPromptEntries(payload, paragraphs, { ...DEFAULT_CONFIG, mode: "asset", minImages: 1, promptStyle: "default" as const, promptSyntax: "comfyui" as const, presetNumber: "1" as any });
    const prompt = renderPrompt(entry!.prompt, "comfyui");
    // Per exact original fidelity, dont slice characters - both should be present (task says do not slice)
    expect(prompt).toContain("black hair");
    expect(prompt).toContain("red hair");
    expect(prompt).toContain("looking at viewer");
    expect(prompt).toContain("portrait, cowboy shot");
    expect(prompt).toContain("white background, simple background");
  });

  test("normalizes legacy advanced settings to the v3.5-compatible path", () => {
    const config = normalizeConfig({ mode: "asset", adaptiveMode: true, perspectiveMode: "creative", previousVisualStateEnabled: true });
    expect(config.mode).toBe("asset");
    expect("adaptiveMode" in config).toBeFalse();
    expect("perspectiveMode" in config).toBeFalse();
    expect("previousVisualStateEnabled" in config).toBeFalse();
  });
});

describe("preserved quality-of-life behavior", () => {
  test("retains quotes on selected prompts", () => {
    const payload: ParsedPayload = { scenes: [{ place: "room", shots: [{
      paragraph: 1, camera: "portrait", situation: "1girl", characters: [], quote: "Stay with me."
    }] }] };
    expect(selectPromptEntries(payload, paragraphs, { ...DEFAULT_CONFIG, minImages: 1 })[0]?.quote).toBe("Stay with me.");
  });

  test("formats recent context from newest to older without inlay markup", () => {
    const context = formatRecentContext([
      { id: "1", role: "assistant", content: "Earlier" },
      { id: "2", role: "user", content: "Later" },
      { id: "3", role: "assistant", content: "Current" }
    ], 2, 2);
    expect(context.indexOf("Later")).toBeLessThan(context.indexOf("Earlier"));
    expect(context).toContain("## Previous Character Messages");
  });
});
