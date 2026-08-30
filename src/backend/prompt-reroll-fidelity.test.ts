import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { extractLLMPrompts, normalizeCharacterData, getFinalPromptsForGeneration, extractPresetSections, buildAnimaPromptBody, resolvePresetContent } from "./prompt.js";
import { BUNDLED_PRESETS } from "./original-presets.js";
import { normalizeScenePayload, selectPromptEntries } from "./scenes.js";
import type { ParsedPayload, PreparedParagraph } from "./types.js";

function cfg(overrides: any = {}) {
  return { ...DEFAULT_CONFIG, ...overrides } as any;
}

describe("prompt-reroll fidelity golden", () => {
  test("positive override respected, fallback uses exact keys", () => {
    const charWithPos = { label: "girl", appearance: "red hair", positive: "customPos" };
    const norm = normalizeCharacterData(charWithPos, cfg({ originalReference: false }));
    expect(norm?.positive).toBe("customPos");
    // empty positive fallback: without original => label,age,appearance,body,attire,expression,action
    const charFallback = { label: "girl", age: "18", appearance: "red hair", body: "slim", attire: "dress", expression: "smile", action: "standing" };
    const norm2 = normalizeCharacterData(charFallback, cfg({ originalReference: false }));
    expect(norm2?.positive).toBe("girl, 18, red hair, slim, dress, smile, standing");
    // with original true, name added
    const charWithName = { name: "Alice", label: "girl", appearance: "red hair", attire: "dress" };
    const norm3 = normalizeCharacterData(charWithName, cfg({ originalReference: true, originalCreationName: "Anima", promptSyntax: "nai" }));
    expect(norm3?.positive).toContain("Alice");
    // without original, name not included
    const norm4 = normalizeCharacterData(charWithName, cfg({ originalReference: false }));
    expect(norm4?.positive).not.toContain("Alice");
    expect(norm4?.positive).toBe("girl, red hair, dress");
    // null/none handling
    const charNull = { label: "null", appearance: "NONE", attire: "dress" };
    const norm5 = normalizeCharacterData(charNull, cfg({}));
    expect(norm5?.positive).toBe("dress");
  });

  test("null/none rules and name suffix/parens logic", () => {
    const char = { name: "Bob", label: "boy" };
    const norm = normalizeCharacterData(char, cfg({ originalReference: true, originalCreationName: "Creator", promptSyntax: "nai" }));
    expect(norm?.name).toBe("Bob (Creator)");
    const normComfy = normalizeCharacterData(char, cfg({ originalReference: true, originalCreationName: "Creator", promptSyntax: "comfyui" }));
    expect(normComfy?.name).toBe("Bob \\(Creator\\)");
    // name null => empty
    const charNullName = { name: "null", label: "girl", appearance: "red" };
    const norm2 = normalizeCharacterData(charNullName, cfg({}));
    expect(norm2?.name).toBe("");
  });

  test("scene text is shot.scene or situation+parent place, defect stored situation/place empty", () => {
    const payload: ParsedPayload = { scenes: [{ place: "forest", shots: [{ paragraph: 1, situation: "a clearing", camera: "wide shot", characters: [] }] }] };
    const normalized = normalizeScenePayload(payload, cfg({}));
    expect(normalized[0].shot.scene).toBe("a clearing, forest");
    expect((normalized[0].shot as any).situation).toBe("");
    expect((normalized[0].shot as any).place).toBe("");
    expect((normalized[0].shot as any).camera).toBe("wide shot");
    // when shot.scene provided, use it directly
    const payload2: ParsedPayload = { scenes: [{ place: "forest", shots: [{ paragraph: 1, scene: "custom scene", situation: "ignored", camera: "cam", characters: [] }] }] };
    const n2 = normalizeScenePayload(payload2, cfg({}));
    expect(n2[0].shot.scene).toBe("custom scene");
  });

  test("extractPresetSections exact", () => {
    const [p, n] = extractPresetSections("[Positive]\nhello\n[Negative]\nworld");
    expect(p).toBe("hello");
    expect(n).toBe("world");
    const [p2, n2] = extractPresetSections("only positive");
    expect(p2).toBe("only positive");
    expect(n2).toBe("");
    const [p3, n3] = extractPresetSections("");
    expect(p3).toBe("");
    expect(n3).toBe("");
  });

  test("applyPreset double-brace {{prompt}} leaves outer braces", () => {
    const raw = { setup: "a", charPos: "b", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const entries = [{ comment: "프리셋 99", content: "[Positive]\npre {{prompt}} suf\n[Negative]\nneg" }];
    const [pos] = getFinalPromptsForGeneration(raw, cfg({ presetNumber: "99", promptStyle: "default", promptSyntax: "nai", encodeMode: "0", supplement: false }), entries);
    // "{{prompt}}" with promptBody "a, b" (actually setup a + charPos b with divider " | " for nai default)
    expect(pos).toContain("{a | b}");
    expect(pos).toContain("pre {");
    expect(pos).toContain("} suf");
  });

  test("missing placeholders append", () => {
    const raw = { setup: "S", charPos: "C", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const entries = [{ comment: "프리셋 99", content: "[Positive]\nstatic\n[Negative]\nneg" }];
    const [pos] = getFinalPromptsForGeneration(raw, cfg({ presetNumber: "99", promptStyle: "default", promptSyntax: "nai", encodeMode: "0", supplement: false }), entries);
    // static has no placeholders, so should append promptBody with divider " | " for nai default
    expect(pos).toBe("static | S | C");
  });

  test("compat vs noncompat delimiters and parenthesis escaping", () => {
    const raw = { setup: "s", charPos: "(a)", charNeg: "(b)", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const entries = [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\n{prompt}" }];
    // noncompat (nai): positive escaped, negative not, pipe normalized
    const [posNai, negNai] = getFinalPromptsForGeneration(raw, cfg({ presetNumber: "99", promptStyle: "default", promptSyntax: "nai", encodeMode: "0" }), entries);
    expect(posNai).toContain("\\(a\\)");
    expect(negNai).toBe("(b)");
    expect(negNai).not.toContain("\\(");
    // compat (comfy): brace conversion, newline cleanup, no escape
    const raw2 = { setup: "{s}", charPos: "", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [posComfy] = getFinalPromptsForGeneration(raw2, cfg({ presetNumber: "99", promptSyntax: "comfyui" }), entries);
    expect(posComfy).toContain("(s)");
    expect(posComfy).not.toContain("{s}");
  });

  test("protected ||...|| pipe normalization", () => {
    const raw = { setup: "a | b ||c|d|| e", charPos: "", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const entries = [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\n{prompt}" }];
    const [pos] = getFinalPromptsForGeneration(raw, cfg({ presetNumber: "99", promptSyntax: "nai" }), entries);
    // outside protected, "a | b" should be normalized to "a | b", inside ||...|| preserved? Our logic protects ||c|d||
    expect(pos).toContain("||c|d||");
    expect(pos).toContain("a | b");
  });

  test("customPositive front, customNegative defect at positive end, supplement after with correct divider", () => {
    const raw = { setup: "s", charPos: "c", charNeg: "", supplement: "sup", situation: "", place: "", camera: "", action: "" } as any;
    const entries = [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\nneg" }];
    const base = cfg({ presetNumber: "99", promptStyle: "default", promptSyntax: "nai", customPositivePrefix: "pre", customNegative: "neg2", supplement: true, encodeMode: "0" });
    const [pos] = getFinalPromptsForGeneration(raw, base, entries);
    // order: pre, s | c, neg2, sup
    const preIdx = pos.indexOf("pre");
    const sIdx = pos.indexOf("s");
    const neg2Idx = pos.indexOf("neg2");
    const supIdx = pos.indexOf("sup");
    expect(preIdx).toBeLessThan(sIdx);
    expect(neg2Idx).toBeGreaterThan(sIdx);
    expect(supIdx).toBeGreaterThan(neg2Idx);
    // supplement divider for default is ", "
    expect(pos).toContain("neg2, sup");
    // anima divider would be ",\n" (no space after newline per original)
    const baseAnima = cfg({ presetNumber: "99", promptStyle: "anima", promptSyntax: "nai", customPositivePrefix: "pre", customNegative: "neg2", supplement: true });
    const [posAnima] = getFinalPromptsForGeneration(raw, baseAnima, entries);
    expect(posAnima).toContain("neg2,\nsup");
  });

  test("asset injections order", () => {
    const raw = { setup: "s", charPos: "c", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const entries = [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\nneg" }];
    const [pos] = getFinalPromptsForGeneration(raw, cfg({ presetNumber: "99", mode: "asset", promptStyle: "default", promptSyntax: "nai" }), entries);
    expect(pos.indexOf("portrait")).toBeLessThan(pos.indexOf("white background"));
    expect(pos.indexOf("portrait")).toBeLessThan(pos.indexOf("cowboy shot"));
    expect(pos).toContain("looking at viewer");
  });

  test("placeholder decode timing and Comfy brace conversion", () => {
    const raw = { setup: "BP3", charPos: "", charNeg: "BP3", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const entries = [{ comment: "프리셋 99", content: "[Positive]\n{prompt} {x}\n[Negative]\n{prompt} {y}" }];
    const [pos, neg] = getFinalPromptsForGeneration(raw, cfg({ presetNumber: "99", encodeMode: "0", promptSyntax: "comfyui" }), entries);
    expect(pos).toContain("pussy");
    expect(neg).toContain("pussy");
    expect(pos).toContain("(x)");
    expect(neg).toContain("(y)");
    expect(pos).not.toContain("{x}");
  });

  test("dynamic preset requested/fallback/bundled", () => {
    const requested = [{ comment: "프리셋 2", content: "[Positive]\nreq\n[Negative]\nreqNeg" }, { comment: "프리셋 1", content: "[Positive]\nfb\n[Negative]\nfbNeg" }];
    const raw = { setup: "s", charPos: "", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const [posReq] = getFinalPromptsForGeneration(raw, cfg({ presetNumber: "2" }), requested);
    expect(posReq).toContain("req");
    // missing requested -> fallback to 1
    const [posFb] = getFinalPromptsForGeneration(raw, cfg({ presetNumber: "99" }), requested);
    expect(posFb).toContain("fb");
    // no runtime at all -> bundled 1
    const [posBundled] = getFinalPromptsForGeneration(raw, cfg({ presetNumber: "99" }), []);
    expect(posBundled).toContain("@k144d");
  });

  test("saved Legacy preset selection overrides dynamic lorebook presets", () => {
    const raw = { setup: "scene", charPos: "character", charNeg: "shotNeg", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const runtime = [{ comment: "프리셋 7", content: "[Positive]\nruntimePreset\n[Negative]\nruntimeNeg" }];
    const saved = { id: "saved-1", name: "Saved", positivePrefix: "savedPositive", negativePrefix: "savedNegative" };
    const [selectedPos, selectedNeg] = getFinalPromptsForGeneration(raw, cfg({
      presetNumber: "7",
      promptPresets: [saved],
      activePromptPresetId: saved.id
    }), runtime);
    expect(selectedPos).toContain("savedPositive");
    expect(selectedPos).not.toContain("runtimePreset");
    expect(selectedNeg).toContain("savedNegative");
    expect(selectedNeg).toContain("shotNeg");

    const [dynamicPos] = getFinalPromptsForGeneration(raw, cfg({
      presetNumber: "7",
      promptPresets: [saved],
      activePromptPresetId: null
    }), runtime);
    expect(dynamicPos).toContain("runtimePreset");
    expect(dynamicPos).not.toContain("savedPositive");
  });

  test("initial raw storage preserved", () => {
    const payload: ParsedPayload = { scenes: [{ place: "room", shots: [{ paragraph: 1, camera: "cam", situation: "sit", characters: [{ label: "girl", appearance: "red hair" }] }] }] };
    const paragraphs: PreparedParagraph[] = [{ parserIndex: 1, originalIndex: 1, text: "para1" }];
    const selected = selectPromptEntries(payload, paragraphs, cfg({ presetNumber: "99", promptStyle: "default", supplement: false }), [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\n{prompt}" }]);
    expect(selected[0].rawPromptData).toBeDefined();
    expect(selected[0].rawPromptData.situation).toBe("");
    expect(selected[0].rawPromptData.place).toBe("");
    expect(selected[0].rawPromptData.camera).toBe("cam");
    expect(selected[0].rawPromptData.setup).toContain("cam");
  });

  test("recomposition uses current settings (simulated reroll)", () => {
    const raw = { setup: "s1", charPos: "c1", charNeg: "n1", supplement: "sup1", situation: "", place: "", camera: "", action: "" } as any;
    const entries = [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\n{prompt}" }];
    const cfg1 = cfg({ presetNumber: "99", customPositivePrefix: "pre1", supplement: false });
    const [pos1] = getFinalPromptsForGeneration(raw, cfg1, entries);
    expect(pos1).toContain("pre1");
    const cfg2 = cfg({ presetNumber: "99", customPositivePrefix: "pre2", supplement: true });
    const [pos2] = getFinalPromptsForGeneration(raw, cfg2, entries);
    expect(pos2).toContain("pre2");
    expect(pos2).not.toContain("pre1");
    expect(pos2).toContain("sup1");
    expect(pos1).not.toContain("sup1");
  });

  test("comma cleanup and triple newline collapse", () => {
    const raw = { setup: "a,,  , b", charPos: ", c", charNeg: "", supplement: "", situation: "", place: "", camera: "", action: "" } as any;
    const entries = [{ comment: "프리셋 99", content: "[Positive]\n{prompt}\n[Negative]\n{prompt}" }];
    const [pos] = getFinalPromptsForGeneration(raw, cfg({ presetNumber: "99" }), entries);
    expect(pos).not.toContain(",,");
    expect(pos.startsWith(",")).toBe(false);
    // triple newline collapse: preset with \n\n\n
    const entries2 = [{ comment: "프리셋 99", content: "[Positive]\na\n\n\n\nb\n[Negative]\nneg" }];
    const [pos2] = getFinalPromptsForGeneration(raw, cfg({ presetNumber: "99" }), entries2);
    expect(pos2).not.toContain("\n\n\n");
  });
});
