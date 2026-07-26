import { describe, expect, test } from "bun:test";
import { renderReviewHtml } from "./review.js";
import type { ImageStudyManifest } from "./types.js";

describe("image study review page", () => {
  test("includes blinded categorical controls and preserves overall voting", () => {
    const html = renderReviewHtml({
      schemaVersion: 1,
      runId: "run",
      workflowHash: "hash",
      seeds: [],
      cases: [],
      images: []
    } as unknown as ImageStudyManifest, "C:/run");
    expect(html).toContain("Identity & attire");
    expect(html).toContain("Action ownership");
    expect(html).toContain("Environment & camera");
    expect(html).toContain("data-vote=\"left\"");
    expect(html).toContain("not_applicable");
  });
});
