import { describe, expect, test } from "bun:test";
import { runV376ParityEvaluation } from "./engine.js";

describe("V3.7.6 Source-Faithful Parity Test Suite", () => {
  test("evaluates complete deterministic parity suite with 100% pass rate", async () => {
    const report = await runV376ParityEvaluation();

    expect(report.version).toBe("3.7.6");
    expect(report.overallPassed).toBe(true);
    expect(report.summary.failedCases).toBe(0);
    expect(report.summary.failedAssertions).toBe(0);
    expect(report.summary.passedCases).toBe(26);
    expect(report.summary.passedAssertions).toBe(82);

    // Verify all 5 categories passed
    expect(report.categories.length).toBe(5);
    for (const cat of report.categories) {
      expect(cat.failed).toBe(0);
      expect(cat.passed).toBeGreaterThan(0);
    }
  });

  test("validates schema typo tolerance and Levenshtein <= 2 bounds", async () => {
    const report = await runV376ParityEvaluation();
    const schemaCase = report.cases.find((c) => c.id === "schema-key-tolerance");
    expect(schemaCase).toBeDefined();
    expect(schemaCase?.passed).toBe(true);
  });

  test("validates standalone gender tag filtering and character normalization", async () => {
    const report = await runV376ParityEvaluation();
    const genderCase = report.cases.find((c) => c.id === "schema-gender-filtering");
    expect(genderCase?.passed).toBe(true);

    const normCase = report.cases.find((c) => c.id === "schema-character-normalization");
    expect(normCase?.passed).toBe(true);
  });

  test("validates sex omission contract under NSFW mode", async () => {
    const report = await runV376ParityEvaluation();
    const sexCase = report.cases.find((c) => c.id === "schema-sex-omission");
    expect(sexCase).toBeDefined();
    expect(sexCase?.passed).toBe(true);
  });

  test("validates zero unresolved macro braces across all 48 option combinations", async () => {
    const report = await runV376ParityEvaluation();
    const macroCase = report.cases.find((c) => c.id === "instruction-macro-integrity");
    expect(macroCase).toBeDefined();
    expect(macroCase?.passed).toBe(true);
  });

  test("validates mode and feature conditional instruction rendering", async () => {
    const report = await runV376ParityEvaluation();
    const modeCase = report.cases.find((c) => c.id === "instruction-mode-conditionals");
    expect(modeCase?.passed).toBe(true);

    const featCase = report.cases.find((c) => c.id === "instruction-feature-conditionals");
    expect(featCase?.passed).toBe(true);

    const pipeCase = report.cases.find((c) => c.id === "instruction-pipelines");
    expect(pipeCase?.passed).toBe(true);
  });

  test("validates scoped deduplication and keyword replacements", async () => {
    const report = await runV376ParityEvaluation();
    const dedupCase = report.cases.find((c) => c.id === "prompt-scoped-deduplication");
    expect(dedupCase?.passed).toBe(true);

    const kwCase = report.cases.find((c) => c.id === "prompt-keyword-replacements");
    expect(kwCase?.passed).toBe(true);
  });

  test("validates prompt assembly exact parity across modes, separators, and syntaxes", async () => {
    const report = await runV376ParityEvaluation();
    const promptCases = report.cases.filter((c) => c.category === "prompt");
    expect(promptCases.length).toBe(12);
    for (const pc of promptCases) {
      expect(pc.passed).toBe(true);
    }
  });

  test("validates NovelAI V4 native mode with mismatched negatives falling back to baseNeg", async () => {
    const report = await runV376ParityEvaluation();
    const naiCase = report.cases.find((c) => c.id.includes("nai-mismatched-negatives"));
    expect(naiCase).toBeDefined();
    expect(naiCase?.passed).toBe(true);
  });

  test("validates custom affix ordering (customPos prefix, customNeg quality suffix, customNegative)", async () => {
    const report = await runV376ParityEvaluation();
    const affixCase = report.cases.find((c) => c.id.includes("custom-affix-ordering"));
    expect(affixCase).toBeDefined();
    expect(affixCase?.passed).toBe(true);
  });

  test("validates all codec roundtrips (Plaintext, Placeholder, Atbash, Base64) and XML prefill", async () => {
    const report = await runV376ParityEvaluation();
    const codecCase = report.cases.find((c) => c.id === "codec-vectors");
    expect(codecCase?.passed).toBe(true);

    const prefillCase = report.cases.find((c) => c.id === "codec-prefill-xml");
    expect(prefillCase?.passed).toBe(true);
  });

  test("validates character memory lifecycle and baseline reference generation", async () => {
    const report = await runV376ParityEvaluation();
    const memCase1 = report.cases.find((c) => c.id === "memory-serialization");
    expect(memCase1?.passed).toBe(true);

    const memCase2 = report.cases.find((c) => c.id === "memory-lifecycle-reference");
    expect(memCase2?.passed).toBe(true);
  });

  test("validates dynamic preset switching via activePromptPresetId in config", async () => {
    const report = await runV376ParityEvaluation();
    const presetCase = report.cases.find((c) => c.id === "prompt-config-preset-selection");
    expect(presetCase).toBeDefined();
    expect(presetCase?.passed).toBe(true);
  });

  test("validates prefill context framing toggle (prefillEnabled true vs false)", async () => {
    const report = await runV376ParityEvaluation();
    const prefillCase = report.cases.find((c) => c.id === "codec-prefill-context-framing");
    expect(prefillCase).toBeDefined();
    expect(prefillCase?.passed).toBe(true);
  });
});
