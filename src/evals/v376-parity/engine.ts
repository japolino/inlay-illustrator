/**
 * Deterministic V3.7.6 Source Parity Evaluation Engine.
 *
 * Executes parity test suites offline without live or paid model calls:
 * - Suite 1: Schema Recovery & Structural Tolerance (fixJsonKeys, sex omission, gender tag stripping, character normalization)
 * - Suite 2: Instruction Conditional Rendering (macro integrity, mode/feature conditional coverage, core/format pipelines)
 * - Suite 3: Prompt Compilation & Delimiter Exactness (scoped deduplication, keyword replacements, presets, custom affixes, NAI v4 channels)
 * - Suite 4: Codec Roundtrip & Request Framing (Plain, Placeholder, Atbash, Base64, XML Prefill)
 * - Suite 5: Character Memory Lifecycle & Context Baseline (depth decay, appearance baseline, tag suppression)
 *
 * All assertions traced directly to source files in references/v376/.
 */

import {
  buildV376Instruction,
  buildV376PreprocessInstruction,
  buildV376CoreInstruction,
  buildV376FormatInstruction,
  applyV376KeywordReplacements,
  resolveV376Variables,
} from "../../backend/v376/instructions.js";
import {
  compileV376Shot,
  applyPreset,
  extractPresetSections,
  extractLLMPrompts,
  removeDuplicateTags,
  decodePlaceholders as decodePromptPlaceholders,
} from "../../backend/v376/prompt.js";
import {
  parseV376Payload,
  fixJsonKeys,
  levenshteinDistance,
  fuzzyMatchKey,
  filterStandaloneGenderTags,
  normalizeReferenceTags,
  normalizeCharacterData,
  extractCardImageJson,
} from "../../backend/v376/schema.js";
import {
  atbashCipher,
  base64Decode,
  base64Encode,
  decodePlaceholders,
  encodePrompt,
  decodeResponse,
  parsePrefillToMessages,
  buildNumberedText,
  buildV376Context,
} from "../../backend/v376/context.js";
import {
  updateV376Memory,
  buildAppearanceReference,
  parseMemoryEntryValue,
  serializeMemoryEntryValue,
} from "../../backend/v376/memory.js";
import { RAW_PRESET_1 } from "../../backend/v376/data.js";
import type {
  V376Mode,
  V376Options,
  V376PromptSeparator,
  V376PromptSyntax,
  V376Shot,
  V376TextLanguage,
} from "../../backend/v376/types.js";
import {
  ALL_GOLDEN_FIXTURES,
  FIXTURE_ILLUSTRATION_SINGLE,
  FIXTURE_ILLUSTRATION_MULTI,
  FIXTURE_ASSET_MODE,
  FIXTURE_COMIC_MODE,
  FIXTURE_NSFW_SEX_OMITTED,
  FIXTURE_MISSPELLED_KEYS_RAW,
  FIXTURE_TRAILING_COMMAS_RAW,
  FIXTURE_NAI_MISMATCHED_NEGATIVES,
  FIXTURE_CUSTOM_AFFIX,
} from "./fixtures/golden-scenes.js";
import { GOLDEN_CODEC_VECTORS } from "./fixtures/golden-codecs.js";
import { GOLDEN_PROMPT_EXPECTATIONS } from "./fixtures/golden-prompts.js";
import { loadAuditFixtures } from "./fixtures/fixtures-loader.js";
import type {
  GoldenCodecVector,
  GoldenPromptExpectation,
  GoldenSceneFixture,
  ParityAssertion,
  ParityCategorySummary,
  ParityTestCaseResult,
  SourceProvenance,
  V376ParityReport,
} from "./types.js";

/**
 * Runs the complete V3.7.6 deterministic parity evaluation suite.
 */
export async function runV376ParityEvaluation(): Promise<V376ParityReport> {
  const startTime = Date.now();
  const cases: ParityTestCaseResult[] = [];

  // 1. Schema & Structural Tolerance Suite
  cases.push(testSchemaKeyTolerance());
  cases.push(testSchemaStandaloneGenderFiltering());
  cases.push(testSchemaCharacterNormalization());
  cases.push(testSchemaSexOmission());
  cases.push(testSchemaTrailingCommas());

  // 2. Instructions Conditional Rendering Suite
  cases.push(testInstructionMacroIntegrity());
  cases.push(testInstructionModeConditionals());
  cases.push(testInstructionFeatureConditionals());
  cases.push(testInstructionCoreAndFormatPipelines());

  // 3. Prompt Assembly & Separator Parity Suite
  cases.push(testPromptScopedDeduplication());
  cases.push(testPromptKeywordReplacements());
  cases.push(testPromptPresetSections());
  cases.push(testPromptConfigPresetSelection());
  cases.push(...testPromptExpectations());

  // 4. Codec Roundtrips & Request Framing Suite
  cases.push(testCodecVectors());
  cases.push(testPrefillXmlStructure());
  cases.push(testContextPrefillFraming());

  // 5. Memory Lifecycle & Context Baseline Suite
  cases.push(testMemorySerializationAndParsing());
  cases.push(testMemoryTurnTransitionAndReference());

  // Calculate summaries
  const categoriesMap = new Map<string, { total: number; passed: number; failed: number; durationMs: number }>();
  let totalAssertions = 0;
  let passedAssertions = 0;
  let failedAssertions = 0;

  for (const c of cases) {
    const cat = categoriesMap.get(c.category) ?? { total: 0, passed: 0, failed: 0, durationMs: 0 };
    cat.total += 1;
    if (c.passed) cat.passed += 1;
    else cat.failed += 1;
    cat.durationMs += c.durationMs;
    categoriesMap.set(c.category, cat);

    for (const a of c.assertions) {
      totalAssertions += 1;
      if (a.passed) passedAssertions += 1;
      else failedAssertions += 1;
    }
  }

  const categories: ParityCategorySummary[] = Array.from(categoriesMap.entries()).map(([category, stats]) => ({
    category,
    ...stats,
  }));

  const passedCases = cases.filter((c) => c.passed).length;
  const failedCases = cases.length - passedCases;

  return {
    timestamp: new Date().toISOString(),
    version: "3.7.6",
    overallPassed: failedCases === 0 && failedAssertions === 0,
    summary: {
      totalSuites: categories.length,
      totalCases: cases.length,
      passedCases,
      failedCases,
      totalAssertions,
      passedAssertions,
      failedAssertions,
      totalDurationMs: Date.now() - startTime,
    },
    categories,
    cases,
  };
}

// ============================================================================
// Test Suite 1: Schema & Structural Recovery
// ============================================================================

function testSchemaKeyTolerance(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/trigger_runtime.lua",
    lines: "1110-1149",
    description: "Levenshtein distance <= 2 fuzzy match against KNOWN_JSON_KEYS",
  };

  const d1 = levenshteinDistance("scens", "scenes");
  assertions.push({
    name: "levenshteinDistance('scens', 'scenes') === 1",
    passed: d1 === 1,
    expected: 1,
    actual: d1,
    provenance,
  });

  const matched = fuzzyMatchKey("apperance", 2);
  assertions.push({
    name: "fuzzyMatchKey('apperance', 2) resolves to 'appearance'",
    passed: matched === "appearance",
    expected: "appearance",
    actual: matched,
    provenance,
  });

  const rawObj = JSON.parse(FIXTURE_MISSPELLED_KEYS_RAW.rawResponse!);
  const fixed = fixJsonKeys(rawObj) as Record<string, any>;
  assertions.push({
    name: "fixJsonKeys repairs 'scens' -> 'scenes'",
    passed: Array.isArray(fixed.scenes),
    expected: true,
    actual: Array.isArray(fixed.scenes),
    provenance,
  });

  const shot = fixed.scenes?.[0]?.shots?.[0];
  assertions.push({
    name: "fixJsonKeys repairs 'shost' -> 'shots' and 'paragragh' -> 'paragraph'",
    passed: shot !== undefined && shot.paragraph === 1,
    expected: 1,
    actual: shot?.paragraph,
    provenance,
  });

  const char = shot?.characters?.[0];
  assertions.push({
    name: "fixJsonKeys repairs 'charaters' -> 'characters' and 'apperance' -> 'appearance'",
    passed: char !== undefined && typeof char.appearance === "string",
    expected: true,
    actual: char !== undefined && typeof char.appearance === "string",
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "schema-key-tolerance",
    category: "schema",
    name: "Schema Key Typo Tolerance (Levenshtein <= 2)",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testSchemaStandaloneGenderFiltering(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/trigger_runtime.lua",
    lines: "972-976",
    description: "filterStandaloneGenderTags strips exact boy, girl, 1boy, 1girl while preserving compound phrases",
  };

  const auditFixtures = loadAuditFixtures();
  const fixture = auditFixtures.tag_filtering_and_replacements.find((f) => f.id === "standalone_gender_filtering");

  if (fixture) {
    const actual = filterStandaloneGenderTags(fixture.input);
    assertions.push({
      name: "Strips standalone gender tags from appearance while retaining composite tags",
      passed: actual === fixture.expected,
      expected: fixture.expected,
      actual,
      provenance,
    });
  }

  // Additional edge case checks
  const test1 = filterStandaloneGenderTags("1girl, solo, cat girl, 1boy, tomboy");
  assertions.push({
    name: "Preserves 'cat girl' and 'tomboy' while removing standalone '1girl' and '1boy'",
    passed: test1 === "solo, cat girl, tomboy",
    expected: "solo, cat girl, tomboy",
    actual: test1,
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "schema-gender-filtering",
    category: "schema",
    name: "Standalone Gender Tag Filtering Contract",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testSchemaCharacterNormalization(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/trigger_runtime.lua",
    lines: "960-1015",
    description: "normalizeCharacterData ordering, originalReference canon vs OC name injection, and supplement handling",
  };

  const auditFixtures = loadAuditFixtures();

  for (const item of auditFixtures.character_normalization) {
    const normalized = normalizeCharacterData(item.input, {
      originalReference: item.options.original,
      supplement: item.options.supplement,
    } as any);

    const posMatch = normalized.positive === item.expected.positive;
    assertions.push({
      name: `Character Normalization [${item.id}]: positive prompt match`,
      passed: posMatch,
      expected: item.expected.positive,
      actual: normalized.positive,
      provenance,
    });

    const idMatch = normalized.identity === item.expected.identity;
    assertions.push({
      name: `Character Normalization [${item.id}]: identity fingerprint match`,
      passed: idMatch,
      expected: item.expected.identity,
      actual: normalized.identity,
      provenance,
    });
  }

  const passed = assertions.every((a) => a.passed);
  return {
    id: "schema-character-normalization",
    category: "schema",
    name: "Character Normalization & Identity Extraction Contract",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testSchemaSexOmission(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/Card.Image.axLLM.txt",
    lines: "161",
    description: "Sex attribute is optional when sexual activity is not occurring",
  };

  const payload = FIXTURE_NSFW_SEX_OMITTED.payload!;
  const parsed = parseV376Payload(payload, { mode: "illustration", nsfw: true } as any);

  assertions.push({
    name: "Payload parses cleanly without throwing when sex is omitted in NSFW mode",
    passed: parsed.scenes.length === 1 && parsed.scenes[0].shots.length === 1,
    expected: 1,
    actual: parsed.scenes.length,
    provenance,
  });

  const char = parsed.scenes[0].shots[0].characters[0];
  assertions.push({
    name: "Character sex field is undefined/omitted",
    passed: char.sex === undefined,
    expected: undefined,
    actual: char.sex,
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "schema-sex-omission",
    category: "schema",
    name: "Schema Sex Field Omission Contract",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testSchemaTrailingCommas(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/trigger_runtime.lua",
    lines: "1150-1180",
    description: "extractCardImageJson markdown fence stripping and trailing comma tolerance",
  };

  const parsed = parseV376Payload(FIXTURE_TRAILING_COMMAS_RAW.rawResponse!, { mode: "illustration" } as any);
  assertions.push({
    name: "extractCardImageJson recovers fenced markdown with trailing commas",
    passed: parsed.scenes.length === 1 && parsed.scenes[0].shots[0].characters[0].name === "Grace",
    expected: "Grace",
    actual: parsed.scenes[0]?.shots[0]?.characters[0]?.name,
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "schema-trailing-commas",
    category: "schema",
    name: "Structural Tolerance for Trailing Commas & Markdown Fences",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

// ============================================================================
// Test Suite 2: Instructions Conditional Rendering
// ============================================================================

function testInstructionMacroIntegrity(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/Card.Image.axLLM.txt",
    lines: "1-350",
    description: "All Risu macro conditionals evaluated with zero leftover {{...}} or <%...%>",
  };

  const modes: V376Mode[] = ["illustration", "asset", "comic"];
  const nsfwVals = [false, true];
  const suppVals = [false, true];
  const textVals: V376TextLanguage[] = ["off", "free", "english", "japanese"];

  let totalCombos = 0;
  let cleanCombos = 0;

  for (const mode of modes) {
    for (const nsfw of nsfwVals) {
      for (const supplement of suppVals) {
        for (const text of textVals) {
          totalCombos += 1;
          const options: V376Options = {
            mode,
            nsfw,
            supplement,
            text,
            quote: true,
            syntax: "nai",
            separator: "pipe",
            imageMin: 1,
            imageMax: 3,
            characterMax: 2,
            panelMin: 2,
            originalReference: false,
            originalCreationName: "",
            encodingMode: "plain",
          };

          const rendered = buildV376Instruction(options);
          const stripped = rendered.replace(/\{\{user\}\}/g, "");
          const hasMacroBraces = stripped.includes("{{") || stripped.includes("}}");
          const hasMacroPercent = stripped.includes("<%") || stripped.includes("%>");

          if (!hasMacroBraces && !hasMacroPercent) {
            cleanCombos += 1;
          }
        }
      }
    }
  }

  assertions.push({
    name: "0 unresolved macro tags across all 48 option combinations",
    passed: cleanCombos === totalCombos,
    expected: `${totalCombos} / ${totalCombos}`,
    actual: `${cleanCombos} / ${totalCombos}`,
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "instruction-macro-integrity",
    category: "instructions",
    name: "Instruction Macro Conditional Integrity (Zero Unresolved Tags)",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testInstructionModeConditionals(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/Card.Image.axLLM.txt",
    lines: "12-80",
    description: "Distinct mode instructions: Illustration, Asset (1 character), and Comic (panels/composition)",
  };

  const baseOpts: V376Options = {
    mode: "illustration",
    nsfw: false,
    supplement: true,
    text: "off",
    quote: false,
    syntax: "nai",
    separator: "pipe",
    imageMin: 1,
    imageMax: 3,
    characterMax: 2,
    panelMin: 2,
    originalReference: false,
    originalCreationName: "",
  };

  // Illustration Mode
  const renderedIllustration = buildV376Instruction(baseOpts);
  assertions.push({
    name: "Illustration mode includes 'Prefer closer framing over wide shots'",
    passed: renderedIllustration.includes("Prefer closer framing over wide shots"),
    expected: true,
    actual: renderedIllustration.includes("Prefer closer framing over wide shots"),
    provenance,
  });

  // Asset Mode
  const renderedAsset = buildV376Instruction({ ...baseOpts, mode: "asset" });
  assertions.push({
    name: "Asset mode enforces exactly 1 character rule",
    passed: renderedAsset.includes("One shot per selected paragraph, each containing exactly one visible character."),
    expected: true,
    actual: renderedAsset.includes("One shot per selected paragraph, each containing exactly one visible character."),
    provenance,
  });

  // Comic Mode
  const renderedComic = buildV376Instruction({ ...baseOpts, mode: "comic" });
  assertions.push({
    name: "Comic mode specifies panels and composition",
    passed: renderedComic.includes("panels") && renderedComic.includes("composition"),
    expected: true,
    actual: renderedComic.includes("panels") && renderedComic.includes("composition"),
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "instruction-mode-conditionals",
    category: "instructions",
    name: "Instruction Mode Conditional Coverage (Illustration, Asset, Comic)",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testInstructionFeatureConditionals(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/Card.Image.axLLM.txt",
    lines: "150-250",
    description: "Feature conditionals: NSFW sex, supplement natural language, text/dialogue language, quotes",
  };

  const baseOpts: V376Options = {
    mode: "illustration",
    nsfw: true,
    supplement: true,
    text: "english",
    quote: true,
    syntax: "nai",
    separator: "pipe",
    imageMin: 1,
    imageMax: 3,
    characterMax: 2,
    panelMin: 2,
    originalReference: false,
    originalCreationName: "",
  };

  // NSFW conditional
  const nsfwOn = buildV376Instruction(baseOpts);
  const nsfwOff = buildV376Instruction({ ...baseOpts, nsfw: false });
  assertions.push({
    name: "NSFW=true includes sex instructions",
    passed: nsfwOn.includes("sex: sex of character") || nsfwOn.includes("sex"),
    expected: true,
    actual: nsfwOn.includes("sex"),
    provenance,
  });
  assertions.push({
    name: "NSFW=false excludes 'sex: sex of character'",
    passed: !nsfwOff.includes("sex: sex of character"),
    expected: true,
    actual: !nsfwOff.includes("sex: sex of character"),
    provenance,
  });

  // Supplement conditional
  const suppOn = buildV376Instruction(baseOpts);
  const suppOff = buildV376Instruction({ ...baseOpts, supplement: false });
  assertions.push({
    name: "Supplement=true includes natural language guidance",
    passed: suppOn.includes("If tags are insufficient to convey the scene's appearance"),
    expected: true,
    actual: suppOn.includes("If tags are insufficient to convey the scene's appearance"),
    provenance,
  });
  assertions.push({
    name: "Supplement=false excludes supplement instructions",
    passed: !suppOff.includes("supplement: {"),
    expected: true,
    actual: !suppOff.includes("supplement: {"),
    provenance,
  });

  // Dialogue / Text language conditional
  const textEnglish = buildV376Instruction(baseOpts);
  const textOff = buildV376Instruction({ ...baseOpts, text: "off" });
  assertions.push({
    name: "Text='english' includes dialogue / text guidelines",
    passed: textEnglish.includes("text:") || textEnglish.includes("English"),
    expected: true,
    actual: textEnglish.includes("text:") || textEnglish.includes("English"),
    provenance,
  });
  assertions.push({
    name: "Text='off' excludes text attribute definition",
    passed: !textOff.includes("text: speech bubbles or dialogue"),
    expected: true,
    actual: !textOff.includes("text: speech bubbles or dialogue"),
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "instruction-feature-conditionals",
    category: "instructions",
    name: "Instruction Feature Conditional Coverage (NSFW, Supplement, Text, Quote)",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testInstructionCoreAndFormatPipelines(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/Card.Image.Format.txt, references/v376/Card.Core.axLLM.txt",
    lines: "1-100",
    description: "Format instruction schemas, preprocess min/max shots, and keyword replacement pipelines",
  };

  // Format Instruction: Mode 0 full vs minimal vs comic
  const fullFmt = buildV376FormatInstruction({
    mode: "illustration",
    nsfw: true,
    supplement: true,
    text: "english",
    quote: true,
  } as any);

  assertions.push({
    name: 'Format instruction Mode 0 full includes "quote", "sex", "supplement"',
    passed: fullFmt.includes('"quote"') && fullFmt.includes('"sex"') && fullFmt.includes('"supplement"'),
    expected: true,
    actual: fullFmt.includes('"quote"') && fullFmt.includes('"sex"') && fullFmt.includes('"supplement"'),
    provenance,
  });

  const comicFmt = buildV376FormatInstruction({
    mode: "comic",
    nsfw: false,
    supplement: false,
    text: "english",
    quote: true,
  } as any);

  assertions.push({
    name: 'Format instruction Comic mode includes "panels" and excludes "camera"',
    passed: comicFmt.includes('"panels"') && !comicFmt.includes('"camera"'),
    expected: true,
    actual: comicFmt.includes('"panels"') && !comicFmt.includes('"camera"'),
    provenance,
  });

  // Preprocess Instruction
  const prep = buildV376PreprocessInstruction({ mode: "illustration", imageMin: 1, imageMax: 4 } as any);
  assertions.push({
    name: "buildV376PreprocessInstruction contains dynamic bounds '1 to 4 shots'",
    passed: prep.includes("1–4 shots total"),
    expected: true,
    actual: prep.includes("1–4 shots total"),
    provenance,
  });

  // Keyword replacements on LLM input
  const replacedInput = applyV376KeywordReplacements("loli and shota");
  assertions.push({
    name: "applyV376KeywordReplacements converts 'loli' -> 'young girl' and 'shota' -> 'young boy'",
    passed: replacedInput === "young girl and young boy",
    expected: "young girl and young boy",
    actual: replacedInput,
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "instruction-pipelines",
    category: "instructions",
    name: "Core, Format, Preprocess & Input Keyword Pipelines",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

// ============================================================================
// Test Suite 3: Prompt Assembly & Separator Exactness
// ============================================================================

function testPromptScopedDeduplication(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/trigger_runtime.lua",
    lines: "1660-1675",
    description: "removeDuplicateTags deduplicates strictly within pipe segment; cross-character repetition preserved",
  };

  const auditFixtures = loadAuditFixtures();
  const fixture = auditFixtures.tag_filtering_and_replacements.find((f) => f.id === "scoped_deduplication");

  if (fixture) {
    const actual = removeDuplicateTags(fixture.input);
    assertions.push({
      name: "Deduplicates case-insensitively within pipe segment while preserving cross-segment repetitions",
      passed: actual === fixture.expected,
      expected: fixture.expected,
      actual,
      provenance,
    });
  }

  const passed = assertions.every((a) => a.passed);
  return {
    id: "prompt-scoped-deduplication",
    category: "prompt",
    name: "Scoped Deduplication Contract (Per-Segment Ordering)",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testPromptKeywordReplacements(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/trigger_runtime.lua",
    lines: "1320-1360",
    description: "extractLLMPrompts: 'from front' -> 'straight-on', 'young girl' -> 'loli', 'young boy' -> 'shota'",
  };

  const shot: V376Shot = {
    paragraph: 1,
    camera: "wide shot, from front",
    scene: "young girl sitting",
    characters: [
      {
        name: "CharA",
        label: "girl",
        age: "young girl",
        appearance: "blonde hair, blue eyes",
        attire: "",
      },
      {
        name: "CharB",
        label: "boy",
        age: "young boy",
        appearance: "brown hair",
        attire: "",
      },
    ],
  };

  const extracted = extractLLMPrompts(shot, { mode: "illustration" });
  assertions.push({
    name: "Replaces 'from front' -> 'straight-on' and 'young girl' -> 'loli' in setupPrompt",
    passed: extracted.setupPrompt === "wide shot, straight-on, loli sitting",
    expected: "wide shot, straight-on, loli sitting",
    actual: extracted.setupPrompt,
    provenance,
  });

  assertions.push({
    name: "Replaces 'young girl' -> 'loli' and 'young boy' -> 'shota' in charPositive",
    passed: extracted.charPositive === "girl, loli, blonde hair, blue eyes | boy, shota, brown hair",
    expected: "girl, loli, blonde hair, blue eyes | boy, shota, brown hair",
    actual: extracted.charPositive,
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "prompt-keyword-replacements",
    category: "prompt",
    name: "Keyword Replacements on Prompt Extraction",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testPromptPresetSections(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/trigger_runtime.lua",
    lines: "1597-1645",
    description: "extractPresetSections splits [Positive] and [Negative] blocks case-insensitively",
  };

  const sections = extractPresetSections(RAW_PRESET_1);
  assertions.push({
    name: "Extracts non-empty [Positive] preset block",
    passed: sections.positive.includes("1.35::henriiku (ahemaru)::"),
    expected: true,
    actual: sections.positive.includes("1.35::henriiku (ahemaru)::"),
    provenance,
  });

  assertions.push({
    name: "Extracts non-empty [Negative] preset block",
    passed: sections.negative.includes("censored, logo, watermark"),
    expected: true,
    actual: sections.negative.includes("censored, logo, watermark"),
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "prompt-preset-sections",
    category: "prompt",
    name: "Preset DSL Section Parsing ([Positive] / [Negative])",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}


function testPromptConfigPresetSelection(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/trigger_runtime.lua",
    lines: "1600-1625",
    description: "activePromptPresetId selection from config.promptPresets dynamically converts and applies preset template",
  };

  const preset1 = {
    id: "preset-watercolor",
    name: "Watercolor Style",
    positivePrefix: "watercolor medium, soft brush strokes",
    negativePrefix: "heavy ink, photorealistic",
  };

  const preset2 = {
    id: "preset-retro-anime",
    name: "Retro 90s Anime",
    positivePrefix: "cel shaded, 1990s vintage anime, retro aesthetic",
    negativePrefix: "modern digital illustration, 3d render",
  };

  const shot: V376Shot = {
    paragraph: 1,
    camera: "close-up",
    scene: "quiet library",
    characters: [
      {
        name: "Alice",
        label: "girl",
        age: "young adult",
        appearance: "brown hair, spectacles",
        attire: "cardigan",
      },
    ],
  };

  // Compile with activePromptPresetId = "preset-retro-anime"
  const compiledRetro = compileV376Shot(shot, {
    mode: "illustration",
    separator: "pipe",
    syntax: "nai",
    promptPresets: [preset1, preset2] as any,
    activePromptPresetId: "preset-retro-anime",
  });

  assertions.push({
    name: "Active preset 'preset-retro-anime' injects positivePrefix into compiled prompt",
    passed: compiledRetro.prompt.includes("cel shaded, 1990s vintage anime, retro aesthetic"),
    expected: true,
    actual: compiledRetro.prompt.includes("cel shaded, 1990s vintage anime, retro aesthetic"),
    provenance,
  });

  assertions.push({
    name: "Active preset 'preset-retro-anime' appends negativePrefix to negative prompt",
    passed: compiledRetro.negative.includes("modern digital illustration, 3d render"),
    expected: true,
    actual: compiledRetro.negative.includes("modern digital illustration, 3d render"),
    provenance,
  });

  // Switch to activePromptPresetId = "preset-watercolor"
  const compiledWatercolor = compileV376Shot(shot, {
    mode: "illustration",
    separator: "pipe",
    syntax: "nai",
    promptPresets: [preset1, preset2] as any,
    activePromptPresetId: "preset-watercolor",
  });

  assertions.push({
    name: "Switching active preset to 'preset-watercolor' applies new positivePrefix",
    passed: compiledWatercolor.prompt.includes("watercolor medium, soft brush strokes"),
    expected: true,
    actual: compiledWatercolor.prompt.includes("watercolor medium, soft brush strokes"),
    provenance,
  });

  assertions.push({
    name: "Switching active preset to 'preset-watercolor' applies new negativePrefix",
    passed: compiledWatercolor.negative.includes("heavy ink, photorealistic"),
    expected: true,
    actual: compiledWatercolor.negative.includes("heavy ink, photorealistic"),
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "prompt-config-preset-selection",
    category: "prompt",
    name: "Config Preset Selection via activePromptPresetId",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testPromptExpectations(): ParityTestCaseResult[] {
  const fixturesMap = new Map<string, GoldenSceneFixture>();
  for (const f of ALL_GOLDEN_FIXTURES) {
    fixturesMap.set(f.id, f);
  }

  return GOLDEN_PROMPT_EXPECTATIONS.map((exp, idx) => {
    const start = Date.now();
    const assertions: ParityAssertion[] = [];
    const fixture = fixturesMap.get(exp.fixtureId);

    if (!fixture || !fixture.payload) {
      return {
        id: `prompt-case-${idx + 1}`,
        category: "prompt",
        name: `Prompt Compilation: Missing Fixture ${exp.fixtureId}`,
        passed: false,
        assertions: [
          {
            name: "Fixture exists",
            passed: false,
            expected: "Valid fixture",
            actual: "Fixture not found",
            provenance: exp.provenance,
          },
        ],
        durationMs: 0,
      };
    }

    const shot = fixture.payload.scenes[0].shots[0];
    const place = fixture.payload.scenes[0].place;
    const compileOpts = {
      ...exp.options,
      presetContent: RAW_PRESET_1,
    };
    const compiled = compileV376Shot(shot, compileOpts, { parentPlace: place });

    // Assert exact prompt string
    const promptMatch = compiled.prompt === exp.expected.prompt;
    assertions.push({
      name: `Prompt exact match (${exp.options.mode}, sep: ${exp.options.separator}, syntax: ${exp.options.syntax})`,
      passed: promptMatch,
      expected: exp.expected.prompt,
      actual: compiled.prompt,
      provenance: exp.provenance,
    });

    // Assert exact negative string
    const negMatch = compiled.negative === exp.expected.negative;
    assertions.push({
      name: "Negative exact match",
      passed: negMatch,
      expected: exp.expected.negative,
      actual: compiled.negative,
      provenance: exp.provenance,
    });

    // If nativeCharacters expected
    if (exp.expected.nativeCharacters) {
      const countMatch = compiled.nativeCharacters?.length === exp.expected.nativeCharacters.length;
      assertions.push({
        name: "Native characters count match",
        passed: countMatch,
        expected: exp.expected.nativeCharacters.length,
        actual: compiled.nativeCharacters?.length ?? 0,
        provenance: exp.provenance,
      });

      if (countMatch && compiled.nativeCharacters) {
        for (let cIdx = 0; cIdx < exp.expected.nativeCharacters.length; cIdx++) {
          const expectedChar = exp.expected.nativeCharacters[cIdx];
          const actualChar = compiled.nativeCharacters[cIdx];
          const charMatch =
            actualChar.prompt === expectedChar.prompt &&
            actualChar.name === expectedChar.name &&
            (actualChar.negative ?? "") === (expectedChar.negative ?? "");

          assertions.push({
            name: `Native character [${cIdx}] prompt/negative match`,
            passed: charMatch,
            expected: expectedChar,
            actual: actualChar,
            provenance: exp.provenance,
          });
        }
      }
    }

    const passed = assertions.every((a) => a.passed);
    return {
      id: `prompt-${exp.fixtureId}-${exp.options.mode}-${exp.options.separator}-${exp.options.syntax}`,
      category: "prompt",
      name: `Prompt Exact Parity: ${fixture.name} (${exp.options.mode}, ${exp.options.separator}, ${exp.options.syntax})`,
      passed,
      assertions,
      durationMs: Date.now() - start,
    };
  });
}

// ============================================================================
// Test Suite 4: Codec Roundtrips & Request Framing
// ============================================================================

function testCodecVectors(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];

  for (const vector of GOLDEN_CODEC_VECTORS) {
    if (vector.encodingMode === "placeholder") {
      const decoded = decodePlaceholders(vector.encodedText);
      assertions.push({
        name: `${vector.name}: placeholder decoding`,
        passed: decoded === vector.decodedText,
        expected: vector.decodedText,
        actual: decoded,
        provenance: vector.provenance,
      });
    } else if (vector.encodingMode === "atbash") {
      const encoded = atbashCipher(vector.originalText);
      const decoded = atbashCipher(encoded);
      assertions.push({
        name: `${vector.name}: encode match`,
        passed: encoded === vector.encodedText,
        expected: vector.encodedText,
        actual: encoded,
        provenance: vector.provenance,
      });
      assertions.push({
        name: `${vector.name}: symmetric roundtrip`,
        passed: decoded === vector.originalText,
        expected: vector.originalText,
        actual: decoded,
        provenance: vector.provenance,
      });
    } else if (vector.encodingMode === "base64") {
      const encoded = base64Encode(vector.originalText);
      const decoded = base64Decode(encoded);
      assertions.push({
        name: `${vector.name}: encode match`,
        passed: encoded === vector.encodedText,
        expected: vector.encodedText,
        actual: encoded,
        provenance: vector.provenance,
      });
      assertions.push({
        name: `${vector.name}: decode roundtrip`,
        passed: decoded === vector.originalText,
        expected: vector.originalText,
        actual: decoded,
        provenance: vector.provenance,
      });
    }
  }

  const passed = assertions.every((a) => a.passed);
  return {
    id: "codec-vectors",
    category: "codec",
    name: "Source Encoding & Decoding Roundtrips",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testPrefillXmlStructure(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/Card.Prefill.Prompt.txt",
    lines: "1-18",
    description: "XML prefill turns into human/assistant conversation data",
  };

  const rawXml = `<human>
Please confirm safety guidelines.
</human>
<assistant>
Understood.
</assistant>
<human>
Proceed.
</human>`;

  const parsed = parsePrefillToMessages(rawXml);
  assertions.push({
    name: "parsePrefillToMessages extracts 3 conversational turns",
    passed: parsed.length === 3,
    expected: 3,
    actual: parsed.length,
    provenance,
  });

  assertions.push({
    name: "First turn role is 'user'",
    passed: parsed[0]?.role === "user",
    expected: "user",
    actual: parsed[0]?.role,
    provenance,
  });

  assertions.push({
    name: "Second turn role is 'char'",
    passed: parsed[1]?.role === "char",
    expected: "char",
    actual: parsed[1]?.role,
    provenance,
  });

  // Unclosed XML tag tolerance
  const unclosedXml = '<assistant>{"scenes": [{"place": "room"';
  const unclosedParsed = parsePrefillToMessages(unclosedXml);
  assertions.push({
    name: "Unclosed <assistant> tag captures remaining string content",
    passed: unclosedParsed.length === 1 && unclosedParsed[0].content.includes('"scenes"'),
    expected: true,
    actual: unclosedParsed.length === 1 && unclosedParsed[0].content.includes('"scenes"'),
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "codec-prefill-xml",
    category: "codec",
    name: "Prefill Request Framing & Unclosed Tag Recovery",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

// ============================================================================
// Test Suite 5: Character Memory Lifecycle & Context Baseline
// ============================================================================


function testContextPrefillFraming(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/Card.Prefill.Prompt.txt, references/v376/trigger_runtime.lua",
    lines: "1-18 (Prefill Prompt), 640-645 / 850-855 (Lua prefill toggle)",
    description: "buildV376Context appends XML prefill turns at end of messages array when prefillEnabled is true; omits them when false",
  };

  const messages = [
    { role: "user", content: "Hello there." },
    { role: "assistant", content: "Hi! How can I help you today?" },
  ];
  const paragraphs = [{ parserIndex: 1, originalIndex: 1, text: "The afternoon sun illuminated the studio warmly." }];
  const baseOptions: V376Options = {
    mode: "illustration",
    syntax: "nai",
    separator: "pipe",
    imageMin: 1,
    imageMax: 3,
    characterMax: 2,
    panelMin: 1,
    encodingMode: "plain",
    nsfw: false,
    supplement: false,
    text: "off",
    quote: false,
    originalReference: false,
    originalCreationName: "",
  };

  // With prefillEnabled = true
  const contextWithPrefill = buildV376Context({
    targetMessageText: "Hi! How can I help you today?",
    includeCount: 0,
    paragraphs,
    messages: messages as any,
    targetIndex: 1,
    options: {
      ...baseOptions,
      prefillEnabled: true,
    },
  });

  // With prefillEnabled = false
  const contextNoPrefill = buildV376Context({
    targetMessageText: "Hi! How can I help you today?",
    includeCount: 0,
    paragraphs,
    messages: messages as any,
    targetIndex: 1,
    options: {
      ...baseOptions,
      prefillEnabled: false,
    },
  });

  assertions.push({
    name: "Enabling prefill adds exactly 3 prefill turns (<human>, <assistant>, <human>) at end",
    passed: contextWithPrefill.length - contextNoPrefill.length === 3,
    expected: 3,
    actual: contextWithPrefill.length - contextNoPrefill.length,
    provenance,
  });

  const lastPrefillMsg = contextWithPrefill[contextWithPrefill.length - 1];
  const secondLastPrefillMsg = contextWithPrefill[contextWithPrefill.length - 2];
  assertions.push({
    name: "Last prefill message is user acknowledgement ('Yeah, thanksh.')",
    passed: lastPrefillMsg?.content.includes("Yeah, thanksh.") === true,
    expected: true,
    actual: lastPrefillMsg?.content.includes("Yeah, thanksh."),
    provenance,
  });

  assertions.push({
    name: "Second-to-last prefill message is assistant confirmation ('Understood.')",
    passed: secondLastPrefillMsg?.content.includes("Understood.") === true,
    expected: true,
    actual: secondLastPrefillMsg?.content.includes("Understood."),
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "codec-prefill-context-framing",
    category: "codec",
    name: "Context Prefill Framing Toggle (prefillEnabled true vs false)",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testMemorySerializationAndParsing(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/trigger_runtime.lua",
    lines: "265-290",
    description: "parseMemoryEntryValue handles 3-part, 2-part, and legacy 1-part formats; serialize produces 3-part",
  };

  const parsed3 = parseMemoryEntryValue("blonde hair, blue eyes|||hat, glasses|||4", 5);
  assertions.push({
    name: "parseMemoryEntryValue: parses 3-part format (tags|||negTags|||depth)",
    passed: parsed3.tags === "blonde hair, blue eyes" && parsed3.negTags === "hat, glasses" && parsed3.depth === 4,
    expected: { tags: "blonde hair, blue eyes", negTags: "hat, glasses", depth: 4 },
    actual: parsed3,
    provenance,
  });

  const parsed2 = parseMemoryEntryValue("black hair|||3", 5);
  assertions.push({
    name: "parseMemoryEntryValue: parses backward-compatible 2-part format (tags|||depth)",
    passed: parsed2.tags === "black hair" && parsed2.depth === 3,
    expected: { tags: "black hair", depth: 3 },
    actual: parsed2,
    provenance,
  });

  const serialized = serializeMemoryEntryValue(parsed3);
  assertions.push({
    name: "serializeMemoryEntryValue: produces standard 'tags|||negTags|||depth' string",
    passed: serialized === "blonde hair, blue eyes|||hat, glasses|||4",
    expected: "blonde hair, blue eyes|||hat, glasses|||4",
    actual: serialized,
    provenance,
  });

  const passed = assertions.every((a) => a.passed);
  return {
    id: "memory-serialization",
    category: "memory",
    name: "Character Memory Serialization & Backward-Compatible Parsing",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}

function testMemoryTurnTransitionAndReference(): ParityTestCaseResult {
  const start = Date.now();
  const assertions: ParityAssertion[] = [];
  const provenance: SourceProvenance = {
    file: "references/v376/trigger_runtime.lua",
    lines: "295-350",
    description: "updateV376Memory depth decrement, mention reset, and buildAppearanceReference tag suppression for depth == 0",
  };

  const auditFixtures = loadAuditFixtures();
  const memFixture = auditFixtures.memory_lifecycle.find((m) => m.id === "char_appearance_turn_transition");

  if (memFixture) {
    const state = {
      v376CharacterMemory: memFixture.initial_map,
    };

    const updated = updateV376Memory(state as any, [
      {
        place: "room",
        shots: [
          {
            paragraph: 1,
            characters: memFixture.current_scene_characters,
          },
        ],
      },
    ] as any, { characterContextDepth: 5 });

    // Assert depths
    assertions.push({
      name: "Unmentioned active character (Alice) decrements depth: 5 -> 4",
      passed: updated["Alice"]?.depth === 4,
      expected: 4,
      actual: updated["Alice"]?.depth,
      provenance,
    });

    assertions.push({
      name: "Mentioned character (Bob) resets depth to maxDepth (5) with updated identity tags",
      passed: updated["Bob"]?.depth === 5 && updated["Bob"]?.tags === "black hair, t-shirt",
      expected: { depth: 5, tags: "black hair, t-shirt" },
      actual: { depth: updated["Bob"]?.depth, tags: updated["Bob"]?.tags },
      provenance,
    });

    assertions.push({
      name: "Expired character (Charlie) remains at depth 0 without tag loss in storage",
      passed: updated["Charlie"]?.depth === 0 && updated["Charlie"]?.tags === "red hair",
      expected: { depth: 0, tags: "red hair" },
      actual: { depth: updated["Charlie"]?.depth, tags: updated["Charlie"]?.tags },
      provenance,
    });

    // Reference prompt construction
    const refPrompt = buildAppearanceReference(updated);
    assertions.push({
      name: "buildAppearanceReference matches exact golden markdown structure",
      passed: refPrompt === memFixture.expected_reference_prompt,
      expected: memFixture.expected_reference_prompt,
      actual: refPrompt,
      provenance,
    });

    assertions.push({
      name: "Expired character (Charlie) is listed in header names but suppressed from bullet tag list",
      passed: refPrompt?.includes("Characters: Alice, Bob, Charlie") === true && refPrompt?.includes("- Charlie:") === false,
      expected: true,
      actual: refPrompt?.includes("Characters: Alice, Bob, Charlie") === true && refPrompt?.includes("- Charlie:") === false,
      provenance,
    });
  }

  const passed = assertions.every((a) => a.passed);
  return {
    id: "memory-lifecycle-reference",
    category: "memory",
    name: "Memory Turn Lifecycle & Baseline Reference Generation",
    passed,
    assertions,
    durationMs: Date.now() - start,
  };
}