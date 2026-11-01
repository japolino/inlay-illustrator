import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { AM } from "./core/index.js";
import * as AUTO from "../pipeline/core/auto-core";

const DATA = new URL("./data/", import.meta.url);
const EXTRACT = "C:/Users/eme4/asset-maid-port/extract/";
/**
 * Copies re-extracted from the AM 0.9.90 slice (`tmp-audit/gen-analysis-data.ts`; chest "other" group, free character
 * profile v1 rewrite, no analysis profile picker). The extract folder above is the 0.9.89-era extraction, so these are
 * checked against the slice instead (next test).
 */
const REEXTRACTED_0_9_90 = new Set([
  "analysis-prompt-character-analysis-image.system.txt",
  "analysis-prompt-character-analysis-metadata.system.txt",
  "analysis-prompt-character-analysis-text.system.txt",
  "analysis-response-contract-variants.json",
  "analysis-schema-character-analysis-contract.json",
  "analysis-schema-character-analysis-text-contract.json",
  "analysis-schema-character-visual-profile.json",
  "analysis-schema-free-character-profile.json",
  "analysis-schema-humanlike-group-convention-M1e.json",
  "analysis-schema-identity-catalog-Wb.json",
  "analysis-ui-and-defaults.json",
  "llm-T1e.json",
  "llm-Yb.json",
  "llm-dPe.txt",
  "llm-fPe.txt",
  "llm-uPe.txt",
]);

describe("analysis data files", () => {
  test("copies are byte-identical to the Asset Maid extracts (when the extract folder exists)", () => {
    if (!existsSync(EXTRACT)) return;
    for (const file of readdirSync(DATA)) {
      if (file === ".gitattributes" || REEXTRACTED_0_9_90.has(file)) continue;
      const source = file.startsWith("llm-") ? `${EXTRACT}llm/${file.slice(4)}` : `${EXTRACT}data/${file}`;
      expect(readFileSync(new URL(file, DATA)).equals(readFileSync(source))).toBe(true);
    }
  });

  test("the verbatim slice produces the same prompts and contracts as the data files", () => {
    const rd = (f: string) => readFileSync(new URL(f, DATA), "utf8");
    const item = (mode: string) => ({ analysisId: "x", analysisProfile: "asset", evidenceMode: mode, promptKey: "k" });
    expect(AM.gYe([item("image")])).toBe(rd("analysis-prompt-character-analysis-image.system.txt"));
    expect(AM.gYe([item("metadata")])).toBe(rd("analysis-prompt-character-analysis-metadata.system.txt"));
    expect(AM.gYe([item("text")])).toBe(rd("analysis-prompt-character-analysis-text.system.txt"));
    expect(AM.sOe).toBe(rd("analysis-prompt-artist-metadata-extraction.system.txt"));
    expect(AM.pOe).toBe(rd("analysis-prompt-lorebook-identity-aliases.system.txt"));
    expect(AM.mOe).toBe(rd("analysis-prompt-filename-prefix-grounding.system.txt"));
    expect(AM.Rte).toBe(rd("analysis-prompt-prompt-reclassification-rules.txt"));
    expect(AM.cOe).toBe(rd("analysis-prompt-name-usage-note.txt"));
    expect(AM.dL).toBe(rd("analysis-prompt-untrusted-evidence-note.txt"));
    expect(AM.Tv).toEqual(JSON.parse(rd("analysis-schema-character-analysis-contract.json")));
    expect(AM.l2e).toEqual(JSON.parse(rd("analysis-schema-character-analysis-text-contract.json")));
    expect(AM.Mv).toEqual(JSON.parse(rd("analysis-schema-identity-catalog-Wb.json")));
    expect(AM.s2e).toEqual(JSON.parse(rd("analysis-schema-character-visual-profile.json")));
    expect(AUTO.rm).toEqual(JSON.parse(rd("analysis-schema-free-character-profile.json")));
    expect(AUTO.i2e).toEqual(JSON.parse(rd("analysis-schema-humanlike-group-convention-M1e.json")));
    for (const [copy, original] of [["llm-dPe.txt", "analysis-prompt-character-analysis-image.system.txt"], ["llm-uPe.txt", "analysis-prompt-character-analysis-metadata.system.txt"], ["llm-fPe.txt", "analysis-prompt-character-analysis-text.system.txt"], ["llm-Yb.json", "analysis-schema-character-analysis-contract.json"], ["llm-T1e.json", "analysis-schema-character-analysis-text-contract.json"]])
      expect(rd(copy!)).toBe(rd(original!));
    const variants = JSON.parse(rd("analysis-response-contract-variants.json")) as Record<string, unknown>;
    expect(Object.keys(variants).length).toBeGreaterThan(0);
    for (const [key, expected] of Object.entries(variants)) {
      const [mode, ...profiles] = key.split("+");
      expect(AM.mYe([mode], profiles)).toEqual(expected);
    }
  });
});
