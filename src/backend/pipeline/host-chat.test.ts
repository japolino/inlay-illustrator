import { describe, expect, test } from "bun:test";
import { HostGenerationTracker } from "./host-chat.js";

describe("HostGenerationTracker", () => {
  test("a generation whose end event never arrives stops counting as streaming after the max age", () => {
    let t = 1_000;
    const tracker = new HostGenerationTracker({ now: () => t, maxAgeMs: 5 * 60_000 });
    tracker.started({ generationId: "g1", chatId: "c1", targetMessageId: "m1" });
    expect(tracker.isStreaming("c1")).toBe(true);
    expect(tracker.isStreaming("c1", "m1")).toBe(true);
    t += 5 * 60_000 - 1;
    expect(tracker.isStreaming("c1", "m1")).toBe(true);
    t += 1;
    expect(tracker.isStreaming("c1")).toBe(false);
    expect(tracker.isStreaming("c1", "m1")).toBe(false);
  });

  test("an end without a generation id ends every generation of that chat only", () => {
    const tracker = new HostGenerationTracker();
    tracker.started({ generationId: "g1", chatId: "c1" });
    tracker.started({ generationId: "g2", chatId: "c1", targetMessageId: "m1" });
    tracker.started({ generationId: "g3", chatId: "c2" });
    tracker.ended({ chatId: "c1" });
    expect(tracker.isStreaming("c1")).toBe(false);
    expect(tracker.isStreaming("c2")).toBe(true);
    tracker.ended({ generationId: "g3", chatId: "c2" });
    expect(tracker.isStreaming("c2")).toBe(false);
  });
});
