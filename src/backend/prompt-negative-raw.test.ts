import { describe, expect, test, afterEach } from "bun:test";

afterEach(() => { delete (globalThis as any).spindle; });
import { DEFAULT_CONFIG } from "../shared/config.js";
import { assemblePrompt, getFinalPromptsForGeneration, extractLLMPrompts } from "./prompt.js";
import type { SceneJson, ShotJson } from "./types.js";

describe("shotNegative raw storage and recompute fidelity", () => {
  test("raw (x) negative NOT escaped in NAI (original defect preserved)", () => {
    const cfg = { ...DEFAULT_CONFIG, promptSyntax: "nai" as const, encodeMode: "0" as const, promptStyle: "default" as const, supplement: false, customNegative: "", customPositivePrefix: "", customPositiveSuffix: "", promptPresets: [] as any, activePromptPresetId: null, presetNumber: "99" as any };
    const scene: SceneJson = { place: "room", shots: [] };
    const isolatedEntries: any = [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\n{prompt}" }];
    // For NAI, positive should be escaped, negative should NOT
    // Create raw data with char negative (x)
    const raw = { setup: "portrait", charPos: "girl", charNeg: "(x)", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [pos, neg] = getFinalPromptsForGeneration(raw, cfg, isolatedEntries);
    // Negative parentheses NOT escaped in NAI (only positive)
    expect(neg).toBe("(x)");
    expect(neg).not.toBe("\\(x\\)");
    expect(neg).not.toContain("\\");
    // Positive would be escaped if contained parens, but here positive doesn't have parens; test positive escaping separately
    const rawPos = { setup: "(y)", charPos: "", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [pos2] = getFinalPromptsForGeneration(rawPos, { ...cfg, customPositivePrefix: "" } as any, []);
    expect(pos2).toContain("\\(y\\)");
  });

  test("double-escape does NOT happen when recomposed from raw (negative stays raw)", () => {
    const cfg = { ...DEFAULT_CONFIG, promptSyntax: "nai" as const, encodeMode: "0" as const, presetNumber: "99" as any, promptStyle: "default" as const } as any;
    const isolatedEntries: any = [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\n{prompt}" }];
    const raw = { setup: "", charPos: "", charNeg: "(x)", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [_, firstNegative] = getFinalPromptsForGeneration(raw, cfg, isolatedEntries);
    expect(firstNegative).toBe("(x)");
    // Simulate reroll recompute from same raw should stay "(x)" not double escaped
    const [__, recomputed] = getFinalPromptsForGeneration(raw, cfg, isolatedEntries);
    expect(recomputed).toBe("(x)");
    expect(recomputed).toBe(firstNegative);
    expect(recomputed).not.toBe("\\(x\\)");
  });

  test("renderNegative via getFinal uses current preset but negative parens not escaped", () => {
    const cfgNai = { ...DEFAULT_CONFIG, promptSyntax: "nai" as const, encodeMode: "0" as const, presetNumber: "1" as any, promptStyle: "default" as const, customPositivePrefix: "", customNegative: "", supplement: false } as any;
    // Use lorebook entry to define preset negative
    const presetContent = "[Positive]\n{prompt}\n[Negative]\npresetNeg";
    const entries = [{ comment: "프리셋 1", content: presetContent }];
    const shotRaw = { setup: "", charPos: "", charNeg: "(bad)", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [posNai, negNai] = getFinalPromptsForGeneration(shotRaw, cfgNai, entries);
    expect(negNai).toBe("presetNeg, (bad)");
    expect(negNai).not.toContain("\\(bad\\)");
    const cfgComfy = { ...cfgNai, promptSyntax: "comfyui" as const };
    const [posComfy, negComfy] = getFinalPromptsForGeneration(shotRaw, cfgComfy, entries);
    expect(negComfy).toBe("presetNeg, (bad)");
  });
});
