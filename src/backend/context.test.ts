import { describe, expect, test } from "bun:test";
import { MARKER } from "./constants.js";
import { formatRecentContext } from "./context.js";
import type { ChatMessage } from "./types.js";

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
