import { describe, expect, test } from "bun:test";
import { PUPPET_MAX_PARTS, sanitizePuppetRig, type PuppetPart } from "./puppet.js";

const parts = (raw: unknown): PuppetPart[] => {
  const result = sanitizePuppetRig(raw);
  if (!("parts" in result)) throw new Error(`failure ${result.failure}`);
  return result.parts;
};

describe("sanitizePuppetRig", () => {
  test("converts the model's [y, x] 0-1000 coordinates to [x, y] 0..1 and keeps parents", () => {
    // Shape of a live gemini-4-argon answer (card girl, ff6d38e sandbox run).
    const [torso, head, item] = parts({
      comic: false,
      parts: [
        { label: "torso", character: 0, box_2d: [324, 344, 1000, 938], outline: [[324, 400], [1000, 344], [1000, 938]], pivot: [996, 659], attached_to: null },
        { label: "head", character: 0, box_2d: [0, 427, 401, 881], outline: [], pivot: [341, 691], attached_to: 0 },
        { label: "item", character: 0, box_2d: [336, 432, 504, 558], pivot: [448, 479], attached_to: 1 },
      ],
    });
    expect(torso!.box).toEqual([0.344, 0.324, 0.938, 1]);
    expect(torso!.outline).toEqual([[0.4, 0.324], [0.344, 1], [0.938, 1]]);
    expect(head!.pivot).toEqual([0.691, 0.341]);
    // Parent pointing at a torso means "the body" (-1); other parents are kept.
    expect(head!.parent).toBe(-1);
    expect(item!.parent).toBe(1);
  });

  test("clamps coordinates, drops degenerate or unknown parts and re-indexes parents", () => {
    const result = parts({
      parts: [
        { label: "sky", box_2d: [0, 0, 500, 500] },
        { label: "head", box_2d: [-40, 100, 400, 1200], pivot: [380, 500] },
        { label: "forearm", box_2d: [500, 500, 503, 600] },
        { label: "hand", box_2d: [400, 600, 700, 800], pivot: [690, 650], resting: true },
        { label: "item", box_2d: [300, 650, 600, 760], attached_to: 3 },
      ],
    });
    expect(result.map((p) => p.label)).toEqual(["head", "forearm", "item"]);
    expect(result[0]!.box).toEqual([0.1, 0, 1, 0.4]);
    expect(result[1]!.resting).toBe(true);
    expect(result[2]!.parent).toBe(1);
  });

  test("maps appendage aliases to kinds and fills missing pivots", () => {
    const [wing, tail, head] = parts({ parts: [{ label: "wings", box_2d: [100, 0, 600, 300] }, { label: "appendage", kind: "tails", box_2d: [500, 0, 900, 200], pivot: [600, 150] }, { label: "head", box_2d: [0, 300, 400, 700] }] });
    expect(wing).toMatchObject({ label: "appendage", kind: "wing", pivot: [0.15, 0.35] });
    expect(tail!.kind).toBe("tail");
    // Head pivot defaults to the bottom center of its box (the neck).
    expect(head!.pivot).toEqual([0.5, 0.4]);
  });

  test("pulls a pivot far outside its part back next to it", () => {
    const [head] = parts({ parts: [{ label: "head", box_2d: [100, 400, 300, 600], pivot: [950, 950] }] });
    expect(head!.pivot).toEqual([0.7, 0.4]);
  });

  test("breaks parent cycles and self references", () => {
    const result = parts({ parts: [{ label: "head", box_2d: [0, 0, 300, 300], attached_to: 1 }, { label: "hair", box_2d: [100, 0, 600, 300], attached_to: 0 }, { label: "item", box_2d: [100, 500, 300, 700], attached_to: 2 }] });
    expect(result[2]!.parent).toBe(-1);
    // One link of the head <-> hair loop is cut, so walking up always ends.
    for (const start of result.keys()) {
      let at = start, steps = 0;
      while (at >= 0 && steps++ < 10) at = result[at]!.parent;
      expect(at).toBe(-1);
    }
  });

  test("keeps the parent of a part that only hangs from a parent cycle", () => {
    // Item 0 hangs from forearm 1; forearm 1 <-> item 2 is the loop.
    const result = parts({ parts: [{ label: "item", box_2d: [300, 600, 500, 700], attached_to: 1 }, { label: "forearm", box_2d: [400, 500, 700, 700], attached_to: 2 }, { label: "item", box_2d: [500, 700, 700, 800], attached_to: 1 }] });
    expect(result.map((p) => p.parent)).toEqual([1, -1, 1]);
  });

  test("keeps one torso per character and the most visible parts when there are too many", () => {
    const many = [
      { label: "torso", character: 0, box_2d: [300, 0, 1000, 500] },
      { label: "torso", character: 0, box_2d: [300, 0, 1000, 400] },
      ...Array.from({ length: 10 }, (_, i) => ({ label: "hair", character: 0, box_2d: [100, i * 90, 600, i * 90 + 80] })),
      { label: "head", character: 0, box_2d: [0, 100, 300, 400] },
      { label: "forearm", character: 0, box_2d: [400, 500, 700, 700] },
      { label: "item", character: 0, box_2d: [300, 600, 500, 700], attached_to: 13 },
      { label: "head", character: 1, box_2d: [0, 600, 300, 900] },
    ];
    const result = parts({ parts: many });
    expect(result).toHaveLength(PUPPET_MAX_PARTS);
    expect(result.filter((p) => p.label === "torso")).toHaveLength(1);
    expect(result.filter((p) => p.label === "head").map((p) => p.character)).toEqual([0, 1]);
    // The item still hangs from the forearm after the dropped hair locks shifted the indexes.
    const item = result.find((p) => p.label === "item")!;
    expect(result[item.parent]!.label).toBe("forearm");
    expect(result.filter((p) => p.label === "hair")).toHaveLength(PUPPET_MAX_PARTS - 5);
  });

  test("reports comic pages and images with nothing to move", () => {
    expect(sanitizePuppetRig({ comic: true, parts: [{ label: "head", box_2d: [0, 0, 300, 300] }] })).toEqual({ failure: "comic" });
    expect(sanitizePuppetRig({ panels: 4, parts: [] })).toEqual({ failure: "comic" });
    expect(sanitizePuppetRig({ comic: false, parts: [] })).toEqual({ failure: "nothing-found" });
    expect(sanitizePuppetRig({ parts: [{ label: "torso", box_2d: [300, 0, 1000, 500] }] })).toEqual({ failure: "nothing-found" });
    expect(sanitizePuppetRig("nonsense")).toEqual({ failure: "nothing-found" });
  });

  test("accepts a bare part list and drops outlines with fewer than three distinct points", () => {
    const [head] = parts([{ label: "head", box_2d: [0, 0, 300, 300], outline: [[0, 0], [0, 0], [100, 100]] }]);
    expect(head!.outline).toEqual([]);
  });
});
