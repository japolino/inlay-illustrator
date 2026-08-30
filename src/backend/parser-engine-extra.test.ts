import { describe, expect, test, mock } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { selectPromptEntries } from "./scenes.js";
import type { ParsedPayload, PreparedParagraph } from "./types.js";

describe("malformed paragraph: no inheritance from group", () => {
  test("group paragraph does not propagate to shots lacking paragraph", () => {
    const payload: ParsedPayload = {
      scenes: [
        { place: "castle", paragraph: "99" as any, shots: [
          { paragraph: 2, camera: "wide" } as any,
          { camera: "portrait" } as any, // missing paragraph
          { paragraph: "bad", camera: "close" } as any,
        ]}
      ]
    };
    const paragraphs: PreparedParagraph[] = [
      { parserIndex: 2, originalIndex: 2, text: "para2" },
    ];
    const cfg = { ...DEFAULT_CONFIG, maxImages: 5 } as any;
    const selected = selectPromptEntries(payload, paragraphs, cfg);
    // Only shot with paragraph 2 should be selected; missing/bad should be ignored, not inherited as 99
    expect(selected.length).toBe(1);
    expect(selected[0].parserParagraph).toBe(2);
    expect(selected[0].paragraph).toBe(2);
  });

  test("scene without shots legacy paragraph handling", () => {
    const payload: ParsedPayload = { scenes: [{ place: "room", paragraph: 1 } as any] };
    const paragraphs: PreparedParagraph[] = [{ parserIndex: 1, originalIndex: 1, text: "a" }];
    const selected = selectPromptEntries(payload, paragraphs, { ...DEFAULT_CONFIG, maxImages: 5 } as any);
    // Legacy scene (no shots) with paragraph 1 should be selectable as one entry
    expect(selected.length).toBe(1);
    expect(selected[0].parserParagraph).toBe(1);
  });
});

describe("empty selection preserves no-image completion", () => {
  test("selectPromptEntries may return empty and does not throw", () => {
    const payload: ParsedPayload = { scenes: [{ place: "nowhere", shots: [{ paragraph: 99, camera: "wide" } as any] }] };
    const paragraphs: PreparedParagraph[] = [{ parserIndex: 1, originalIndex: 1, text: "a" }];
    const selected = selectPromptEntries(payload, paragraphs, { ...DEFAULT_CONFIG, maxImages: 5 } as any);
    expect(selected).toEqual([]);
  });
});

describe("encode modes 0,1,2 only", () => {
  test("normalizeConfig maps 3 to 0", async () => {
    const { normalizeConfig } = await import("../shared/config.js");
    const cfg = normalizeConfig({ encodeMode: "3" as any });
    expect(cfg.encodeMode).toBe("0");
    const cfg1 = normalizeConfig({ encodeMode: "1" as any });
    expect(cfg1.encodeMode).toBe("1");
    const cfg2 = normalizeConfig({ encodeMode: "2" as any });
    expect(cfg2.encodeMode).toBe("2");
  });
});
