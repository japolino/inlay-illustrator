import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { AM } from "./core/index.js";

const DATA = new URL("./data/", import.meta.url);
const EXTRACT = "C:/Users/eme4/asset-maid-port/extract/";

describe("analysis data files", () => {
  test("copies are byte-identical to the Asset Maid extracts (when the extract folder exists)", () => {
    if (!existsSync(EXTRACT)) return;
    for (const file of readdirSync(DATA)) {
      if (file === ".gitattributes") continue;
      const source = file.startsWith("llm-") ? `${EXTRACT}llm/${file.slice(4)}` : `${EXTRACT}data/${file}`;
      expect(readFileSync(new URL(file, DATA)).equals(readFileSync(source))).toBe(true);
    }
  });

  test("the verbatim slice produces the same prompts and contracts as the data files", () => {
    const rd = (f: string) => readFileSync(new URL(f, DATA), "utf8");
    const item = (mode: string) => ({ analysisId: "x", analysisProfile: "asset", evidenceMode: mode, promptKey: "k" });
    expect(AM.lat([item("image")])).toBe(rd("analysis-prompt-character-analysis-image.system.txt"));
    expect(AM.lat([item("metadata")])).toBe(rd("analysis-prompt-character-analysis-metadata.system.txt"));
    expect(AM.lat([item("text")])).toBe(rd("analysis-prompt-character-analysis-text.system.txt"));
    expect(AM.cPe).toBe(rd("analysis-prompt-artist-metadata-extraction.system.txt"));
    expect(AM.pPe).toBe(rd("analysis-prompt-lorebook-identity-aliases.system.txt"));
    expect(AM.hPe).toBe(rd("analysis-prompt-filename-prefix-grounding.system.txt"));
    expect(AM.Cme).toBe(rd("analysis-prompt-prompt-reclassification-rules.txt"));
    expect(AM.lPe).toBe(rd("analysis-prompt-name-usage-note.txt"));
    expect(AM.x3).toBe(rd("analysis-prompt-untrusted-evidence-note.txt"));
    expect(AM.Yb).toEqual(JSON.parse(rd("analysis-schema-character-analysis-contract.json")));
    expect(AM.T1e).toEqual(JSON.parse(rd("analysis-schema-character-analysis-text-contract.json")));
    expect(AM.Wb).toEqual(JSON.parse(rd("analysis-schema-identity-catalog-Wb.json")));
    const variants = JSON.parse(rd("analysis-response-contract-variants.json")) as Record<string, unknown>;
    expect(Object.keys(variants).length).toBeGreaterThan(0);
    for (const [key, expected] of Object.entries(variants)) {
      const [mode, ...profiles] = key.split("+");
      expect(AM.cat([mode], profiles)).toEqual(expected);
    }
  });
});
