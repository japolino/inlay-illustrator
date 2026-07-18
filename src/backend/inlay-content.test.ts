import { describe, expect, test } from "bun:test";
import type { LlmMessageDTO } from "lumiverse-spindle-types";
import { MARKER } from "./constants.js";
import { stripInlayContent, stripInlayFromMessages } from "./inlay-content.js";

function currentBlock(prompt: string, withMarker = true): string {
  const marker = withMarker ? `${MARKER}\n` : "";
  return `${marker}<div class="inlay-illustrator-image" data-inlay-illustrator="true"><img src="/generated.png" data-inlay-illustrator-prompt="${prompt}"><pre class="inlay-illustrator-prompt" hidden>${prompt}</pre></div>`;
}

describe("Inlay content sanitization", () => {
  test("removes current blocks and restores the surrounding narrative exactly", () => {
    const input = `Before.\r\n\r\n${currentBlock("secret prompt")}\n\nAfter.`;

    expect(stripInlayContent(input)).toBe("Before.\r\n\r\nAfter.");
  });

  test("removes multiple marked and unmarked blocks between paragraphs", () => {
    const input = [
      currentBlock("first"),
      currentBlock("second", false),
      "First paragraph.",
      currentBlock("third"),
      "Second paragraph."
    ].join("\n\n");

    expect(stripInlayContent(input)).toBe("First paragraph.\n\nSecond paragraph.");
  });

  test("removes marker-associated legacy image and Prompt details blocks", () => {
    const legacy = [
      MARKER,
      "![Inlay 1](/api/v1/image-gen/results/legacy)",
      "<details class=\"legacy\">",
      "<summary>Prompt details</summary>",
      "legacy secret prompt",
      "</details>"
    ].join("\n");
    const input = `Before.\n\n${legacy}\n\nAfter.`;

    expect(stripInlayContent(input)).toBe("Before.\n\nAfter.");
  });

  test("scrubs orphan prompt metadata while preserving the image", () => {
    const input = '<img src="/kept.png" data-inlay-illustrator-prompt="secret" data-inlay-illustrator-negative-prompt="negative" data-inlay-illustrator-perspective="creative" data-inlay-illustrator-perspective-source="adaptive" data-inlay-illustrator-image-id="image" data-inlay-illustrator-chat-id="chat" data-inlay-illustrator-message-id="message" data-inlay-illustrator-swipe-id="0" data-inlay-illustrator-image-index="0" alt="kept"><pre class="note inlay-illustrator-prompt" hidden>secret</pre><pre class="inlay-illustrator-negative-prompt" hidden>negative</pre>';

    expect(stripInlayContent(input)).toBe('<img src="/kept.png" alt="kept">');
  });

  test("leaves unrelated HTML, comments, images, and details byte-for-byte intact", () => {
    const unrelated = [
      "<!-- inlay-illustrator -->",
      '<div data-inlay-illustrator="false">Keep this div.</div>',
      '<div data-inlay-illustrator-extra="true">Keep this one too.</div>',
      '<img src="/ordinary.png" alt="ordinary">',
      '<pre class="not-inlay-illustrator-prompt">Keep this pre.</pre>',
      "<details><summary>Prompt ideas</summary>Keep these details.</details>"
    ].join("\n");

    expect(stripInlayContent(unrelated)).toBe(unrelated);
  });
});

describe("assistant message sanitization", () => {
  test("sanitizes strings and multipart text without mutating other roles or parts", () => {
    const user: LlmMessageDTO = { role: "user", content: currentBlock("user-owned text") };
    const imagePart = { type: "image" as const, data: "image-data", mime_type: "image/png" };
    const toolPart = {
      type: "tool_use" as const,
      id: "tool-1",
      name: "inspect",
      input: { markup: currentBlock("tool input") }
    };
    const assistant: LlmMessageDTO = {
      role: "assistant",
      name: "narrator",
      reasoning_content: currentBlock("reasoning"),
      __isChatHistory: true,
      sourceMessageId: "message-1",
      sourceIndexInChat: 7,
      content: [
        { type: "text", text: `${currentBlock("text prompt")}\n\nNarrative.`, cache_control: { type: "ephemeral" } },
        imagePart,
        toolPart
      ]
    };
    const input = [user, assistant];

    const output = stripInlayFromMessages(input);

    expect(output[0]).toBe(user);
    expect(output[1]).not.toBe(assistant);
    expect(assistant.content[0]).toMatchObject({ type: "text", text: expect.stringContaining(MARKER) });
    expect(output[1]).toMatchObject({
      name: "narrator",
      reasoning_content: assistant.reasoning_content,
      __isChatHistory: true,
      sourceMessageId: "message-1",
      sourceIndexInChat: 7
    });
    const parts = output[1].content;
    expect(Array.isArray(parts)).toBe(true);
    if (!Array.isArray(parts)) throw new Error("Expected multipart assistant content.");
    expect(parts[0]).toEqual({ type: "text", text: "Narrative.", cache_control: { type: "ephemeral" } });
    expect(parts[1]).toBe(imagePart);
    expect(parts[2]).toBe(toolPart);
  });
});
