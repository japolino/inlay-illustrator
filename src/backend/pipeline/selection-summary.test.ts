import { describe, expect, test } from "bun:test";
import { ANALYSIS_RECORD_MAX_BYTES } from "../../shared/contract/index.js";
import { analysisRecordOf, selectionSummaryOf, translateSelectionLabel } from "./selection-summary.js";

describe("AI selection history (AM 0.9.90 zoom)", () => {
  test("Korean fallback labels become English; user text passes through", () => {
    expect(translateSelectionLabel("장면 전체")).toBe("Whole scene");
    expect(translateSelectionLabel("장면 공통")).toBe("Scene");
    expect(translateSelectionLabel("카메라")).toBe("Camera");
    expect(translateSelectionLabel("컷 3")).toBe("Panel 3");
    expect(translateSelectionLabel("인물 2")).toBe("Character 2");
    expect(translateSelectionLabel("인물 2 · 등장 1")).toBe("Character 2 · Appearance 1");
    expect(translateSelectionLabel("Alice · 등장 2")).toBe("Alice · Appearance 2");
    expect(translateSelectionLabel("대상 기록 없음")).toBe("No target recorded");
    expect(translateSelectionLabel("이름 기록 없음")).toBe("No name recorded");
    expect(translateSelectionLabel("컷 정보 없음")).toBe("No panel recorded");
    expect(translateSelectionLabel("rooftop panel")).toBe("rooftop panel");
  });

  test("record capture: analysisMetadata first, then the decision's embedded record; oversized records are omitted", () => {
    expect(analysisRecordOf({})).toBeUndefined();
    expect(analysisRecordOf({ analysisMetadata: { v: 1, p: "v5" } })).toEqual({ profile: "v5-hybrid", record: { v: 1, p: "v5" } });
    expect(analysisRecordOf({ decision: { asset_maid_analysis: { v: 1 } } })).toEqual({ profile: "v5-hybrid", record: { v: 1 } });
    const big = analysisRecordOf({ analysisMetadata: { pad: "x".repeat(ANALYSIS_RECORD_MAX_BYTES + 1) } });
    expect(big).toEqual({ profile: "v5-hybrid", record: { v: 1, p: "v5", om: "metadata_size" } });
    expect(selectionSummaryOf(big).status).toBe("omitted");
  });

  test("no record (older images) -> missing", () => {
    expect(selectionSummaryOf(undefined)).toEqual({ status: "missing", scenes: [], interactions: [], sections: [], inventoryRecorded: false });
  });
});
