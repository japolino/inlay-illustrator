import { describe, expect, test } from "bun:test";
import type { ChatMessageUiState } from "../../shared/contract/chat-dom.js";
import {
  aiChoiceZoneTop,
  buildImageGroups,
  centersOf,
  clampCoordinate,
  containRect,
  downloadName,
  filterMentions,
  findMentionTrigger,
  flattenItems,
  insertMention,
  isRemovalPoint,
  markersFromSections,
  mentionCandidates,
  pointToCenter,
  rosterDisplayName,
  stepId,
  stepItem,
  type MentionCandidate
} from "./model.js";

const people: MentionCandidate[] = [
  { id: "a", name: "한서연", ownerName: "Academy", searchKeys: ["서연", "Seo-yeon"] },
  { id: "b", name: "김민아", searchKeys: ["민아", "Mina"] },
  { id: "c", name: "강지훈", searchKeys: ["지훈", "Jihoon"] },
  { id: "d", name: "Ms. Park", searchKeys: ["선생님"] }
];

describe("mention trigger", () => {
  test("finds the last $ before the caret", () => {
    expect(findMentionTrigger("make $서", 7)).toEqual({ start: 5, query: "서" });
    expect(findMentionTrigger("a $b $cd", 8)).toEqual({ start: 5, query: "cd" });
    expect(findMentionTrigger("$", 1)).toEqual({ start: 0, query: "" });
  });
  test("rejects no $, newlines and long queries", () => {
    expect(findMentionTrigger("hello", 5)).toBeNull();
    expect(findMentionTrigger("$ab\ncd", 6)).toBeNull();
    expect(findMentionTrigger(`$${"x".repeat(41)}`, 42)).toBeNull();
    expect(findMentionTrigger(`$${"x".repeat(40)}`, 41)).not.toBeNull();
  });
  test("insert replaces $query with the plain name and moves the caret", () => {
    const text = "make $서 smile";
    const trigger = findMentionTrigger(text, 7)!;
    expect(insertMention(text, trigger, 7, "한서연")).toEqual({ text: "make 한서연 smile", caret: 8 });
  });
  test("insert refuses results longer than 2000 chars", () => {
    const text = `${"a".repeat(1999)}$`;
    expect(insertMention(text, { start: 1999, query: "" }, 2000, "한서연")).toBeNull();
  });
});

describe("mention filter (substring, jamo, chosung)", () => {
  const names = (q: string) => filterMentions(people, q).map((p) => p.name);
  test("empty query keeps every candidate in order", () => {
    expect(names("")).toEqual(["한서연", "김민아", "강지훈", "Ms. Park"]);
  });
  test("substring and search keys", () => {
    expect(names("민")).toEqual(["김민아"]);
    expect(names("mina")).toEqual(["김민아"]);
    expect(names("park")).toEqual(["Ms. Park"]);
  });
  test("partial syllable (jamo) matches", () => {
    expect(names("기")).toEqual(["김민아"]);
    expect(names("서ㅇ")).toEqual(["한서연"]);
  });
  test("chosung-only queries", () => {
    expect(names("ㅎㅅㅇ")).toEqual(["한서연"]);
    expect(names("ㅈㅎ")).toEqual(["강지훈"]);
    expect(names("ㅅ")).toContain("한서연");
  });
  test("prefix matches rank first", () => {
    const list: MentionCandidate[] = [{ id: "1", name: "Ann Lee", searchKeys: [] }, { id: "2", name: "Lee", searchKeys: [] }];
    expect(filterMentions(list, "lee").map((c) => c.id)).toEqual(["2", "1"]);
  });
  test("roster rows become candidates (registered, enabled, no description)", () => {
    const row = (title: string, extra: Record<string, unknown> = {}) => ({ promptKey: title, kind: "lore", title, registered: true, workspaceEnabled: true, recognitionKeys: ["k"], ...extra }) as never;
    const list = mentionCandidates([row("한서연 (Han Seo-yeon)"), row("Off", { workspaceEnabled: false }), row("Desc", { kind: "description" })], "Academy");
    expect(list).toEqual([{ id: "한서연 (Han Seo-yeon)", name: "한서연", ownerName: "Academy", searchKeys: ["한서연 (Han Seo-yeon)", "k"] }]);
    expect(rosterDisplayName("Ms. Park (homeroom teacher)")).toBe("Ms. Park");
  });
});

function state(id: string, slots: Array<{ slot: string; entries: string[]; selected?: string }>, revisions = ["r1"]): ChatMessageUiState {
  return {
    chatId: "c",
    messageId: id,
    swipeIndex: 0,
    messageKey: `illustration:${id}@0`,
    eligible: true,
    attempt: "reroll",
    planStatus: "complete",
    busy: false,
    revisions: revisions.map((r, i) => ({ revisionId: r, index: i + 1, status: "complete", entryCount: 1, deletedSlotIndices: [], createdAt: i })),
    activeRevisionId: revisions[revisions.length - 1]!,
    slots: slots.map((s, i) => ({
      slotId: s.slot,
      slotIndex: i,
      entries: s.entries.map((e) => ({ entryId: e, kind: "generated", assetName: `${e}.__am__.chat.x`, imageId: e, url: `u/${e}`, width: 832, height: 1216, createdAt: 0 })),
      selectedEntryId: s.selected ?? s.entries[s.entries.length - 1]!,
      canRegenerate: true,
      regenerating: false
    })),
    allSlotsDeleted: false
  };
}

describe("chat image groups", () => {
  const groups = buildImageGroups([
    state("m1", [{ slot: "s1", entries: ["e1", "e2"], selected: "e1" }, { slot: "s2", entries: ["e3"] }], ["r1", "r2"]),
    state("m2", []),
    state("m3", [{ slot: "s3", entries: ["e4"] }])
  ]);
  test("one group per message with images, selected entries, revision position", () => {
    expect(groups.map((g) => g.messageId)).toEqual(["m1", "m3"]);
    expect(groups[0]!.items.map((i) => i.entryId)).toEqual(["e1", "e3"]);
    expect(groups[0]!.revisionPosition).toBe(1);
    expect(groups[1]!.ordinal).toBe(2);
  });
  test("stepping wraps around", () => {
    const items = flattenItems(groups);
    expect(stepItem(items, "s3", 1)?.slotId).toBe("s1");
    expect(stepItem(items, "s1", -1)?.slotId).toBe("s3");
    expect(stepItem(items.slice(0, 1), "s1", 1)).toBeNull();
    expect(stepId(["a", "b", "c"], "a", -1)).toBe("c");
    expect(stepId(["a"], "a", 1)).toBeNull();
  });
});

describe("coordinate board geometry", () => {
  test("object-contain rect", () => {
    expect(containRect(1000, 1000, 500, 1000)).toEqual({ left: 250, top: 0, width: 500, height: 1000 });
    expect(containRect(0, 10, 1, 1)).toBeNull();
  });
  test("snap to 0.01 and clamp to 0.05..0.95", () => {
    expect(clampCoordinate(0.333)).toBe(0.33);
    expect(clampCoordinate(0)).toBe(0.05);
    expect(clampCoordinate(1.2)).toBe(0.95);
    expect(pointToCenter({ width: 200, height: 100 }, 50, 50)).toEqual({ x: 0.25, y: 0.5 });
  });
  test("removal below the image edge, AI choice zone above the stage bottom", () => {
    expect(isRemovalPoint({ height: 100 }, 99)).toBe(false);
    expect(isRemovalPoint({ height: 100 }, 100)).toBe(true);
    expect(aiChoiceZoneTop({ left: 0, top: 0, width: 100, height: 800 }, 800)).toBe(736);
    expect(aiChoiceZoneTop({ left: 0, top: 100, width: 100, height: 400 }, 800)).toBe(400);
  });
  test("markers and centers from prompt sections", () => {
    const markers = markersFromSections([
      { id: "main", target: "main", label: "", value: "", negativeValue: "" },
      { id: "actor:0", target: "actor", actorIndex: 0, label: "A", value: "", negativeValue: "", centerX: 0.3, centerY: 0.5 },
      { id: "actor:1", target: "actor", actorIndex: 1, label: "B", value: "", negativeValue: "" }
    ]);
    expect(markers.map((m) => [m.ordinal, m.center])).toEqual([[1, { x: 0.3, y: 0.5 }], [2, null]]);
    expect(centersOf(markers)).toEqual([{ x: 0.3, y: 0.5 }, null]);
  });
  test("download file name", () => {
    expect(downloadName("scene.__am__.chat.123", "/api/v1/image-gen/results/x")).toBe("scene.png");
    expect(downloadName("a/b", "data:image/svg+xml;utf8,x")).toBe("a_b.svg");
  });
});
