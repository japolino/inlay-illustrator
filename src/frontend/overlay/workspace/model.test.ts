import { describe, expect, test } from "bun:test";
import { createDefaultConfig } from "../../../shared/contract/config.js";
import { normalizeFormCollection } from "../../../shared/contract/character.js";
import {
  FILTER_GROUPS,
  evidenceStatusText,
  formDisplayLabel,
  hasEmptyForm,
  isUnanalyzed,
  matchesFilters,
  outfitDisplayLabel,
  pickResultText,
  pickerFilters,
  pickerKind,
  pickerMultiSelect,
  pickerTitle,
  progressFraction,
  progressMessage,
  providerInfo,
  splitTags,
  joinTags,
  triState,
  catalogOptions
} from "./model.js";
import { clampRect, dragRect, exportGeometry, hitTest, isFullImage, letterbox, scaleRect, toSourcePoint } from "./crop-geometry.js";
import { FormDraftStore } from "./drafts.js";
import { addResult, toggleSelection } from "./generation.js";
import { metadataFields } from "./metadata.js";
import { artistToForm, formToEntry } from "./artists-tab.js";
import { setAllAnalysis, analysisStates } from "./profile-row.js";
import type { GenerationSession } from "./session.js";

const collection = normalizeFormCollection({
  defaultFormId: "form_default",
  forms: [
    { id: "form_default", label: "기본", gender: "female", basePromptGroups: { "hair.color": ["black hair"] }, outfits: [{ id: "outfit_default", label: "기본 의상" }], defaultOutfitId: "outfit_default" },
    { id: "form_cat", label: "Cat", gender: "female", basePromptGroups: {}, outfits: [{ id: "o1", label: "" }], defaultOutfitId: "o1" }
  ]
});

describe("provider info", () => {
  test("derives the codec and reference capabilities from the image connection", () => {
    const config = createDefaultConfig();
    config.image.provider = "novelai";
    expect(providerInfo(config, null)).toMatchObject({ provider: "novelai", anima: false, referenceUiVisible: true, outfitGeneration: true });
    config.image.provider = "comfyui";
    expect(providerInfo(config, null)).toMatchObject({ provider: "comfy-ui", anima: true, referenceUiVisible: true });
    config.image.provider = "openai";
    expect(providerInfo(config, null)).toMatchObject({ provider: "generic", anima: true, referenceUiVisible: false, referencesEnabled: false });
  });
});

describe("display labels", () => {
  test("translates stored Korean defaults", () => {
    expect(formDisplayLabel("기본")).toBe("Basic");
    expect(formDisplayLabel("폼 3")).toBe("Form 3");
    expect(formDisplayLabel("Cat")).toBe("Cat");
    expect(outfitDisplayLabel({ id: "a", label: "기본 의상" }, 0)).toBe("Default outfit");
    expect(outfitDisplayLabel({ id: "a", label: "" }, 1)).toBe("Outfit 2");
    expect(outfitDisplayLabel({ id: "a", label: "의상 4" }, 0)).toBe("Outfit 4");
  });
});

describe("forms", () => {
  test("empty / unanalyzed checks use the composed base prompt", () => {
    expect(hasEmptyForm(collection)).toBe(true);
    expect(isUnanalyzed(collection)).toBe(false);
    expect(isUnanalyzed(normalizeFormCollection({}))).toBe(true);
  });
  test("tag text helpers and catalog presets", () => {
    expect(splitTags("black hair, ponytail;  blue_eyes")).toEqual(["black hair", "ponytail", "blue eyes"]);
    expect(joinTags(["a", "b"])).toBe("a, b");
    expect(catalogOptions("hair.length").map((o) => o.value)).toContain("long hair");
    expect(catalogOptions("hair.color")).toEqual([]);
  });
  test("bulk analysis flag covers forms and referenced outfits", () => {
    const off = setAllAnalysis(collection, false);
    expect(analysisStates(off).every((v) => v === false)).toBe(true);
    expect(triState(analysisStates(collection))).toBe(true);
  });
});

describe("filters", () => {
  test("group sets per scope", () => {
    expect(FILTER_GROUPS.assetsCharx.map((g) => g.id)).toEqual(["roster", "origin", "assets", "empty", "checked"]);
    expect(FILTER_GROUPS.prompts.map((g) => g.id)).toEqual(["roster", "origin", "empty", "reference"]);
    expect(FILTER_GROUPS.persona.map((g) => g.id)).toEqual(["empty", "reference"]);
  });
  test("matcher (AM vvt)", () => {
    const facts = { roster: true, origin: "custom" as const, assets: false, empty: true };
    expect(matchesFilters(facts, {})).toBe(true);
    expect(matchesFilters(facts, { roster: "yes", origin: "custom" })).toBe(true);
    expect(matchesFilters(facts, { origin: "lorebook" })).toBe(false);
    expect(matchesFilters(facts, { assets: "yes" })).toBe(false);
    expect(matchesFilters(facts, { assets: "no", empty: "yes" })).toBe(true);
    expect(matchesFilters(facts, { reference: "yes" })).toBe(true);
  });
  test("tri-state", () => {
    expect(triState([])).toBe(false);
    expect(triState([true, true])).toBe(true);
    expect(triState([true, false])).toBe("indeterminate");
  });
});

describe("notices", () => {
  test("progress message and fraction", () => {
    expect(progressMessage({ label: "Prompt AI analysis", done: 1, total: 4 }, true)).toBe("Prompt AI analysis · 1/4");
    expect(progressMessage({ label: "Batch 2/3", done: 1, total: 4 }, true)).toBe("Batch 2/3");
    expect(progressMessage({ label: "x", retry: { attempt: 2, total: 5 } }, true)).toBe("x · 2/5");
    expect(progressMessage({ label: "x" }, false, "Done")).toBe("Done");
    expect(progressFraction({ label: "", done: 1, total: 4 }, true)).toBe(0.25);
    expect(progressFraction({ label: "" }, false)).toBe(1);
  });
  test("z9 text", () => {
    expect(evidenceStatusText({ requestedMode: "image", status: "running", completed: 1, total: 3 })).toBe("Image AI Analyzing · 1/3");
    expect(evidenceStatusText({ requestedMode: "image", effectiveMode: "text", status: "success", completed: 3, total: 3 })).toBe("Image→Body text AI Analysis complete · 3/3");
  });
  test("representative pick result (AM hvt)", () => {
    expect(pickResultText({ addedImages: 2, addedPeople: 2, lorebookNames: ["A", "B", "C", "D"], withheld: 0, unclassified: 0 })).toEqual({ text: "Added 2 images to 2 people · A, B, C…", tone: "success" });
    expect(pickResultText({ addedImages: 0, addedPeople: 0, lorebookNames: [], withheld: 0, unclassified: 3 }).text).toContain("3 candidates with unclear outfit");
    expect(pickResultText({ addedImages: 0, addedPeople: 0, lorebookNames: [], withheld: 0, unclassified: 0 })).toEqual({ text: "No image to add", tone: "warning" });
  });
});

describe("picker", () => {
  test("maps targets to Asset Maid context kinds", () => {
    expect(pickerKind({ kind: "selection", promptKey: "k" })).toBe("asset-selection");
    expect(pickerKind({ kind: "persona", personaId: "p" })).toBe("persona-asset-selection");
    expect(pickerKind({ kind: "persona", personaId: "p", formId: "f" })).toBe("persona-reference");
    expect(pickerKind({ kind: "persona", personaId: "p", formId: "f", outfitId: "o" })).toBe("persona-outfit-reference");
    expect(pickerKind({ kind: "character-outfit", promptKey: "k", formId: "f", outfitId: "o" })).toBe("outfit-reference");
    expect(pickerMultiSelect("asset-selection")).toBe(true);
    expect(pickerMultiSelect("character-reference")).toBe(false);
    expect(pickerFilters("artist-reference")).toEqual(["original", "generated"]);
    expect(pickerTitle("outfit-reference", "Alice")).toBe("Outfit reference : Alice");
    expect(pickerTitle("artist-reference", "x")).toBe("Select artist image");
  });
});

describe("crop geometry", () => {
  test("clamps and normalizes frames", () => {
    expect(clampRect({ x: 90, y: 90, width: -50, height: -50 }, 100, 100)).toEqual({ x: 40, y: 40, width: 50, height: 50 });
    expect(clampRect({ x: 95, y: 0, width: 2, height: 200 }, 100, 100)).toEqual({ x: 84, y: 0, width: 16, height: 100 });
  });
  test("hit test, drag and export", () => {
    const rect = { x: 10, y: 10, width: 50, height: 50 };
    expect(hitTest({ x: 10, y: 10 }, rect, 1)).toBe("nw");
    expect(hitTest({ x: 60, y: 35 }, rect, 1)).toBe("e");
    expect(hitTest({ x: 35, y: 35 }, rect, 1)).toBe("move");
    expect(hitTest({ x: 90, y: 90 }, rect, 1)).toBe("new");
    expect(dragRect({ mode: "move", startPoint: { x: 30, y: 30 }, startRect: rect }, { x: 80, y: 30 }, 100, 100)).toEqual({ x: 50, y: 10, width: 50, height: 50 });
    expect(dragRect({ mode: "se", startPoint: { x: 60, y: 60 }, startRect: rect }, { x: 90, y: 70 }, 100, 100)).toEqual({ x: 10, y: 10, width: 80, height: 60 });
    expect(isFullImage({ x: 0, y: 0, width: 99.6, height: 100 }, 100, 100)).toBe(true);
    expect(exportGeometry({ x: 0, y: 0, width: 3000, height: 1500 }, 3000, 2000)).toMatchObject({ sw: 3000, sh: 1500, width: 1536, height: 768 });
    expect(scaleRect({ x: 10, y: 10, width: 50, height: 50 }, 100, 100, 200, 400)).toEqual({ x: 20, y: 40, width: 100, height: 200 });
    const m = letterbox(200, 100, 100, 100);
    expect(m).toMatchObject({ scale: 1, drawX: 50, drawY: 0 });
    expect(toSourcePoint(60, 20, m)).toEqual({ x: 10, y: 20 });
  });
});

describe("form drafts", () => {
  test("edit, save with base revision, conflict keeps edits", async () => {
    const store = new FormDraftStore();
    const calls: string[] = [];
    let fail = false;
    const saver = async (_key: string, c: typeof collection, rev: string) => {
      calls.push(rev);
      if (fail) throw Object.assign(new Error("conflict"), { error: { code: "conflict" } });
      return { collection: c, revision: "next" };
    };
    store.edit("k", collection, (c) => ({ ...c, defaultFormId: "form_cat" }));
    expect(store.isDirty("k")).toBe(true);
    expect(await store.save("k", saver)).toBe(true);
    expect(store.isDirty("k")).toBe(false);
    const saved = store.entry("k")!.base;
    store.edit("k", saved, (c) => ({ ...c, forms: c.forms.map((f) => ({ ...f, description: "edited" })) }));
    fail = true;
    expect(await store.save("k", saver)).toBe(false);
    expect(store.entry("k")!.conflict).toBe(true);
    expect(store.isDirty("k")).toBe(true);
    // A clean draft follows the server value.
    store.sync("other", collection);
    store.sync("other", { ...collection, defaultFormId: "form_cat" });
    expect(store.entry("other")!.value.defaultFormId).toBe("form_cat");
  });
  test("immediate commits keep a dirty draft and move the base", async () => {
    const store = new FormDraftStore();
    store.edit("k", collection, (c) => ({ ...c, defaultFormId: "form_cat" }));
    await store.commit("k", collection, (c) => setAllAnalysis(c, false), async (_k, c) => ({ collection: c, revision: "r" }));
    const e = store.entry("k")!;
    expect(e.value.defaultFormId).toBe("form_cat");
    expect(analysisStates(e.value).every((v) => !v)).toBe(true);
    expect(analysisStates(e.base).every((v) => !v)).toBe(true);
    expect(e.base.defaultFormId).toBe("form_default");
  });
});

describe("outfit generation session", () => {
  const base = { id: 1, results: [], selectedResultIds: [], savedResultIds: [], replaceCurrent: false, seed: "", seedFixed: false } as unknown as GenerationSession;
  const result = (id: string) => ({ resultId: id, imageId: id, url: "", seed: "7", width: 1, height: 1, positivePrompt: "", negativePrompt: "", createdAt: "" });
  test("results are capped at 8 and auto-selected", () => {
    let s = base;
    for (let i = 0; i < 10; i += 1) s = { ...s, ...addResult(s, result(`r${i}`)) };
    expect(s.results.length).toBe(8);
    expect(s.results[0]!.resultId).toBe("r9");
    expect(s.seed).toBe("7");
    expect(s.selectedResultIds.length).toBe(8);
  });
  test("replace mode is single select", () => {
    const s = { ...base, replaceCurrent: true, selectedResultIds: ["a"] };
    expect(toggleSelection(s, "b")).toEqual(["b"]);
    expect(toggleSelection(s, "a")).toEqual([]);
    expect(toggleSelection({ ...base, selectedResultIds: ["a"] }, "b")).toEqual(["a", "b"]);
  });
});

describe("metadata fields", () => {
  test("builds NovelAI fields", () => {
    const fields = metadataFields({ assetName: "x", provider: "NovelAI", width: 832, height: 1216, prompt: "1girl,   solo", characterPrompts: [{ prompt: "girl", center: { x: 0.5, y: 0.1 } }] });
    expect(fields.map((f) => f.label)).toEqual(["Provider", "Size", "Main prompt", "Character 1 prompt", "Character 1 coordinates"]);
    expect(fields[2]!.value).toBe("1girl, solo");
  });
});

describe("artist dock form", () => {
  test("built-ins store only overrides; user entries keep text", () => {
    const form = { ...artistToForm({ id: "p", title: "P", prompt: "a", negativePrompt: "", description: "", displayTitle: "P", userDefined: false }, { steps: 28, scale: 5, cfgRescale: 0 }), custom: true };
    expect(formToEntry("p", form, true)).toEqual({ id: "p", title: "P", prompt: "", novelAIOverrides: { steps: 28, scale: 5, cfgRescale: 0 } });
    expect(formToEntry("", { ...form, custom: false, negative: " n " }, false)).toEqual({ id: "", title: "P", prompt: "a", negativePrompt: "n" });
  });
});
