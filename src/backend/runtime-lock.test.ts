import { describe, expect, test } from "bun:test";
import { tryAcquireRuntimeLock } from "./runtime-lock.js";

describe("shared runtime locks", () => {
  test("deduplicates matching work, separates scopes, and releases idempotently", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    const releaseGeneration = tryAcquireRuntimeLock("generation", key);
    const releaseImageAction = tryAcquireRuntimeLock("image-action", key);

    expect(releaseGeneration).toBeFunction();
    expect(tryAcquireRuntimeLock("generation", key)).toBeNull();
    expect(releaseImageAction).toBeFunction();

    releaseGeneration?.();
    releaseGeneration?.();
    const releaseAgain = tryAcquireRuntimeLock("generation", key);
    expect(releaseAgain).toBeFunction();

    releaseAgain?.();
    releaseImageAction?.();
  });
});
