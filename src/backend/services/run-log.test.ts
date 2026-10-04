import { describe, expect, test } from "bun:test";
import { brandLogMessage, createRunLog } from "./run-log.js";

describe("run log branding", () => {
  test("replaces the ported cores' Asset Maid prefixes with Inlay", () => {
    expect(brandLogMessage("[Asset Maid React] Charx regex analysis failed: x")).toBe("[Inlay] Charx regex analysis failed: x");
    expect(brandLogMessage("[Asset Maid] first outfit failed")).toBe("[Inlay] first outfit failed");
    expect(brandLogMessage("Analyzer request sent")).toBe("Analyzer request sent");
  });

  test("stores and mirrors the branded message", () => {
    const mirrored: string[] = [];
    const log = createRunLog({ host: { log: { info() {}, warn: (m: string) => mirrored.push(m), error: (m: string) => mirrored.push(m) } } as never });
    const entry = log.append("warn", "analysis", "[Asset Maid React] retry");
    expect(entry.message).toBe("[Inlay] retry");
    expect(mirrored).toEqual(["[Inlay:analysis] [Inlay] retry"]);
  });
});
