import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import {
  auditDynamicCameraDiversity,
  cameraRepairInstruction,
  mergeDynamicCameraRepair
} from "./camera-diversity.js";
import type { ParsedPayload } from "./types.js";

const config = { ...DEFAULT_CONFIG, adaptiveMode: true, promptStyle: "anima" as const };

function payload(cameras: Array<Record<string, unknown>>, modes: string[] = cameras.map(() => "dynamic")): ParsedPayload {
  return {
    scenes: [{
      environment: { location: "street" },
      shots: cameras.map((camera, index) => ({
        paragraph: index + 1,
        perspectiveMode: modes[index],
        camera,
        action: `action ${index + 1}`
      }))
    }]
  };
}

describe("Dynamic camera diversity", () => {
  test("flags exact Dynamic camera tuples and reports softer angle-perspective repetition", () => {
    const parsed = payload([
      { framing: "close-up", angle: "eye level", perspective: "three-quarter view", focus: [] },
      { framing: "close-up", angle: "eye level", perspective: "three-quarter view", focus: ["background blur"] },
      { framing: "medium shot", angle: "eye level", perspective: "three-quarter view", focus: [] },
      { framing: "medium shot", angle: "eye level", perspective: "straight-on", focus: [] }
    ]);

    const audit = auditDynamicCameraDiversity(parsed, config);

    expect(audit.dynamicShotCount).toBe(4);
    expect(audit.exactCollisions).toEqual([expect.objectContaining({ firstIndex: 0, duplicateIndex: 1 })]);
    expect(audit.pairRepetitions).toContainEqual({
      signature: "eye level | three-quarter view",
      indexes: [0, 1, 2],
      paragraphs: [1, 2, 3]
    });
  });

  test("excludes Static and Creative cameras from Dynamic collision repair", () => {
    const repeated = { framing: "medium shot", angle: "eye level", perspective: "straight-on", focus: ["deep focus"] };
    const audit = auditDynamicCameraDiversity(payload([repeated, repeated, repeated], ["dynamic", "static", "creative"]), config);

    expect(audit.dynamicShotCount).toBe(1);
    expect(audit.exactCollisions).toEqual([]);
  });

  test("merges only the later duplicate camera and ignores every other repair mutation", () => {
    const original = payload([
      { framing: "lower body", angle: "low angle", perspective: "from below", focus: [] },
      { framing: "lower body", angle: "low angle", perspective: "from below", focus: [] }
    ]);
    const repaired = structuredClone(original);
    const repairedShots = repaired.scenes?.[0].shots || [];
    repairedShots[0].action = "unwanted mutation";
    repairedShots[0].camera = { framing: "wide shot", angle: "high angle", perspective: "from above", focus: [] };
    repairedShots[1].action = "another unwanted mutation";
    repairedShots[1].camera = { framing: "close-up", angle: "eye level", perspective: "three-quarter view", focus: ["background blur"] };

    const merged = mergeDynamicCameraRepair(original, repaired, config);

    expect(merged?.scenes?.[0].shots?.[0].action).toBe("action 1");
    expect(merged?.scenes?.[0].shots?.[0].camera).toEqual(original.scenes?.[0].shots?.[0].camera);
    expect(merged?.scenes?.[0].shots?.[1].action).toBe("action 2");
    expect(merged?.scenes?.[0].shots?.[1].camera).toEqual(repairedShots[1].camera);
    expect(auditDynamicCameraDiversity(merged || {}, config).exactCollisions).toEqual([]);
  });

  test("rejects unsafe, reordered, or non-improving camera repairs", () => {
    const original = payload([
      { framing: "close-up", angle: "eye level", perspective: "straight-on", focus: [] },
      { framing: "close-up", angle: "eye level", perspective: "straight-on", focus: [] }
    ]);
    const unsafe = structuredClone(original);
    const unsafeShot = unsafe.scenes?.[0].shots?.[1];
    if (unsafeShot) unsafeShot.camera = { framing: "extreme close-up", angle: "worm's-eye view", perspective: "cinematic" };
    const reordered = structuredClone(original);
    reordered.scenes?.[0].shots?.reverse();

    expect(mergeDynamicCameraRepair(original, unsafe, config)).toBeNull();
    expect(mergeDynamicCameraRepair(original, reordered, config)).toBeNull();
    expect(mergeDynamicCameraRepair(original, structuredClone(original), config)).toBeNull();
  });

  test("repair instruction permits justified continuity without encouraging random extremes", () => {
    const parsed = payload([
      { framing: "close-up", angle: "eye level", perspective: "straight-on" },
      { framing: "close-up", angle: "eye level", perspective: "straight-on" }
    ]);
    const instruction = cameraRepairInstruction(auditDynamicCameraDiversity(parsed, config));

    expect(instruction).toContain("continuous camera or POV");
    expect(instruction).toContain("Do not force an extreme or unsuitable angle");
    expect(instruction).toContain("shot 2 (P2) repeats shot 1 (P1)");
  });
});
