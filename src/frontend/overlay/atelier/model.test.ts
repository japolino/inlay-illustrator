import { describe, expect, test } from "bun:test";
import { createAtelierMockState } from "../../dev/mock/atelier.js";
import { sceneOptions } from "../../chat/runtime.js";
import { visibleGroups } from "../../zoom/selection-history.js";
import { ATELIER_LABELS as L } from "./labels.js";
import {
  applyMoves,
  deleteGroup,
  dropIndex,
  errorKind,
  guidelineName,
  guidelineRows,
  listMoves,
  movePromptOrder,
  moveItem,
  orderRows,
  parsePreset,
  parseRulesJson,
  parseWeight,
  renameGroup,
  restorePromptOrder,
  rulesReferencing,
  setPromptPair,
  systemCatalog,
  uniqueId,
  utf8Size,
  validateChannelId,
  validateGroupId,
  validateInteractionId,
  type PresetDocument
} from "./model.js";

const fixture = createAtelierMockState();
const sample = (): PresetDocument => parsePreset(fixture.state.catalog.documents.find((d) => d.id !== "default")!.json).doc!;

describe("atelier model: lists and ids", () => {
  test("moveItem and dropIndex follow the AM splice / midpoint rules", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    const rects = [{ top: 0, height: 10 }, { top: 10, height: 10 }, { top: 20, height: 10 }];
    expect(dropIndex(rects, 2, 2)).toBe(0);
    expect(dropIndex(rects, 29, 0)).toBe(2);
  });

  test("id validation: groups need two lowercase segments, channels custom.*, interactions no dots", () => {
    expect(validateGroupId("mood", [])).toBe(L.fields.idTwoSegments);
    expect(validateGroupId("Mood.tone", [])).toBe(L.fields.idSegment);
    expect(validateGroupId("mood.tone", ["mood.tone"])).toBe(L.fields.idInUse);
    expect(validateGroupId("mood.tone", ["mood.tone"], { current: "mood.tone" })).toBeNull();
    expect(validateChannelId("free.mood", [])).toBe(L.fields.channelId);
    expect(validateChannelId("custom.free.mood", [])).toBeNull();
    expect(validateInteractionId("touch.pat", [])).toBe(L.fields.interactionId);
    expect(validateInteractionId("pat", ["pat"])).toBe(L.fields.idInUse);
    expect(uniqueId("pat", ["pat", "pat_2"])).toBe("pat_3");
  });

  test("weights and prompt pairs", () => {
    expect(parseWeight("1").warning).toBeUndefined();
    expect(parseWeight("0.8").warning).toBe(L.fields.weightBelow);
    expect(parseWeight("11").error).toBeDefined();
    expect(setPromptPair([[1, "smile"]], 1, [0.8, "happy"])).toEqual([[1, "smile"], [0.8, "happy"]]);
    expect(setPromptPair([[1, "smile"]], 0, [1, " "])).toBeNull();
    expect(setPromptPair([[1, "a"], [1, "b"]], 1, null)).toEqual([[1, "a"]]);
  });
});

describe("atelier model: documents", () => {
  test("renaming a group updates interaction sub-groups and rules; deleting reports references", () => {
    const doc = sample();
    expect(rulesReferencing(doc, { group: "mood.tone" })).toBe(1);
    const renamed = renameGroup(doc, "pat.speed", "pat.pace");
    expect(renamed.content.interactions!.find((i) => i.id === "pat")!.detailGroups).toEqual(["pat.pace"]);
    const moodRenamed = renameGroup(doc, "mood.tone", "mood.face");
    expect(JSON.stringify(moodRenamed.content.rules)).toContain("mood.face");
    expect(JSON.stringify(moodRenamed.content.rules)).not.toContain("mood.tone");
    const deleted = deleteGroup(doc, "mood.sky");
    expect(deleted.content.definitions!.some((g) => g.id === "mood.sky")).toBe(false);
  });

  test("rules JSON accepts only a top-level {rules} object without duplicate ids", () => {
    expect(parseRulesJson("{").error).toBe(L.rules.jsonInvalid);
    expect(parseRulesJson('{"rules": [], "x": 1}').error).toBe(L.rules.jsonTopLevel);
    expect(parseRulesJson('{"rules": [{"id": "a"}, {"id": "a"}]}').error).toBeDefined();
    expect(parseRulesJson('{"rules": [{"id": "a", "when": "any", "action": "add", "from": [], "to": []}]}').rules).toHaveLength(1);
  });

  test("output order: moves are stored as a diff from the default order and restore drops them", () => {
    const doc = sample();
    const system = systemCatalog(fixture.baseline.normalizedRawConfig, doc);
    const rows = orderRows(doc, system, "actor").filter((r) => r.kind !== "text" && r.kind !== "interaction");
    const first = rows[0]!.key;
    const last = rows[rows.length - 1]!.key;
    const moved = movePromptOrder(doc, system, "actor", "tag", last, first);
    expect(moved.content.metadata?.promptOrder).toBe(true);
    const after = orderRows(moved, system, "actor").filter((r) => r.kind !== "text" && r.kind !== "interaction");
    expect(after[0]!.key).toBe(last);
    const restored = restorePromptOrder(moved, "actor");
    expect(restored.content.metadata?.promptOrderMoves).toBeUndefined();
    expect(orderRows(restored, system, "actor").map((r) => r.key)).toEqual(orderRows(doc, system, "actor").map((r) => r.key));
  });

  test("listMoves + applyMoves round-trip", () => {
    const before = ["a", "b", "c", "d"];
    const after = ["d", "a", "c", "b"];
    expect(applyMoves(before, listMoves(before, after), (x) => x)).toEqual(after);
  });
});

describe("atelier model: guidelines and errors", () => {
  test("built-in guidelines show English names; rows mark the selected one", () => {
    const rows = guidelineRows(fixture.state, "scene");
    expect(rows.find((r) => r.id === "default")).toMatchObject({ name: "Default illustration", builtIn: true, selected: true });
    expect(rows.find((r) => r.id === "default-comic")?.outputMode).toBe("comic");
    expect(guidelineName("scene", "mine", "My guide")).toBe("My guide");
    expect(guidelineName("imageRatio", "default", "기본")).toBe("Default");
  });

  test("error kinds and the import size", () => {
    expect(errorKind({ code: "conflict", detailCode: "atelier-conflict" })).toBe("conflict");
    expect(errorKind({ code: "bad-request", detailCode: "atelier-validation" })).toBe("validation");
    expect(errorKind({ code: "internal" })).toBe("other");
    expect(utf8Size("가")).toBe(3);
  });

  test("chat directing menu lists the guideline library with English built-in labels", () => {
    const options = sceneOptions(fixture.state.directionMenu);
    expect(options.map((o) => o.value)).toEqual(fixture.state.directionMenu.options.map((o) => o.value));
    expect(options.find((o) => o.value === "default")?.label).toBe("Illustration");
    expect(options.find((o) => o.value === "default-comic")?.label).toBe("Comic");
    expect(sceneOptions(null)).toEqual([]);
  });

  test("selection history range filter keeps valued groups unless the whole list was recorded", () => {
    const groups = [{ id: "a", options: ["x"] }, { id: "b", options: [] }, { id: "c", kind: "text" as const, options: [], recorded: true }];
    expect(visibleGroups(groups, "recorded", true).map((g) => g.id)).toEqual(["a"]);
    expect(visibleGroups(groups, "all", true).map((g) => g.id)).toEqual(["a", "b", "c"]);
    expect(visibleGroups(groups, "all", false).map((g) => g.id)).toEqual(["a"]);
  });
});
