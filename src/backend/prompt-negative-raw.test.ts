import { describe, expect, test, afterEach } from "bun:test";

afterEach(() => { delete (globalThis as any).spindle; });
import { DEFAULT_CONFIG } from "../shared/config.js";
import { assemblePrompt, getFinalPromptsForGeneration, extractLLMPrompts } from "./prompt.js";
import type { SceneJson, ShotJson } from "./types.js";

describe("shotNegative raw storage and recompute fidelity", () => {
  test("raw (x) negative NOT escaped in NAI (original defect preserved)", () => {
    const cfg = { ...DEFAULT_CONFIG, promptSyntax: "nai" as const, encodeMode: "0" as const, promptStyle: "default" as const, supplement: false, customNegative: "", customPositivePrefix: "", customPositiveSuffix: "", promptPresets: [] as any, activePromptPresetId: null };
    const scene: SceneJson = { place: "room", shots: [] };
    // For NAI, positive should be escaped, negative should NOT
    // Create raw data with char negative (x)
    const raw = { setup: "portrait", charPos: "girl", charNeg: "(x)", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [pos, neg] = getFinalPromptsForGeneration(raw, cfg);
    // Negative parentheses NOT escaped in NAI (only positive)
    expect(neg).toBe("(x)");
    expect(neg).not.toBe("\\(x\\)");
    expect(neg).not.toContain("\\");
    // Positive would be escaped if contained parens, but here positive doesn't have parens; test positive escaping separately
    const rawPos = { setup: "(y)", charPos: "", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [pos2] = getFinalPromptsForGeneration(rawPos, { ...cfg, customPositivePrefix: "" } as any);
    expect(pos2).toContain("\\(y\\)");
  });

  test("double-escape does NOT happen when recomposed from raw (negative stays raw)", () => {
    const cfg = { ...DEFAULT_CONFIG, promptSyntax: "nai" as const, encodeMode: "0" as const, promptStyle: "default" as const, promptPresets: [], activePromptPresetId: null } as any;
    const raw = { setup: "", charPos: "", charNeg: "(x)", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [_, firstNegative] = getFinalPromptsForGeneration(raw, cfg);
    expect(firstNegative).toBe("(x)");
    // Simulate reroll recompute from same raw should stay "(x)" not double escaped
    const [__, recomputed] = getFinalPromptsForGeneration(raw, cfg);
    expect(recomputed).toBe("(x)");
    expect(recomputed).toBe(firstNegative);
    expect(recomputed).not.toBe("\\(x\\)");
  });

  test("renderNegative via getFinal uses current structured preset but negative parens not escaped", () => {
    const saved = { id:"p1", name:"P", positivePrefix:"{prompt}", negativePrefix:"presetNeg" };
    const cfgNai = { ...DEFAULT_CONFIG, promptSyntax: "nai" as const, encodeMode: "0" as const, promptStyle: "default" as const, customPositivePrefix: "", customNegative: "", supplement: false, promptPresets:[saved], activePromptPresetId:"p1" } as any;
    const shotRaw = { setup: "", charPos: "", charNeg: "(bad)", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [posNai, negNai] = getFinalPromptsForGeneration(shotRaw, cfgNai);
    expect(negNai).toContain("presetNeg");
    expect(negNai).toContain("(bad)");
    expect(negNai).not.toContain("\\(bad\\)");
    const cfgComfy = { ...cfgNai, promptSyntax: "comfyui" as const };
    const [posComfy, negComfy] = getFinalPromptsForGeneration(shotRaw, cfgComfy);
    expect(negComfy).toContain("presetNeg");
    expect(negComfy).toContain("(bad)");
  });
});
