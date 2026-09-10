# V3.7.6 Source-Faithful Parity Evaluation & Replay Suite

## Overview & Scope
This evaluation suite provides an offline, deterministic source-parity verification framework for the V3.7.6 image pipeline port (`src/backend/v376/`). It verifies deterministic offline compilation and codec fidelity against the decompiled V3.7.6 source logic (`references/v376/trigger_runtime.lua` and `references/v376/` lorebooks).

### Deterministic Offline Authority & Zero Paid Calls
- **Zero Live/Paid Model Calls**: All evaluations run entirely offline using frozen test fixtures and exact source logic comparisons.
- **Source Authority Over Aesthetic Claims**: Parity is judged strictly by fidelity to decompiled V3.7.6 Lua and lorebook behavior, not by subjective aesthetic preference or cinematic stability claims.
- **Tracked Fixtures Only**: No evaluation or test in this suite depends on git-ignored artifacts (`tmp-audit/`). All fixtures are tracked under `src/evals/v376-parity/fixtures/`.
- **Direct Exported Method Evaluation**: The evaluation engine imports and exercises the actual production functions exported by `src/backend/v376/` (`instructions.ts`, `prompt.ts`, `schema.ts`, `context.ts`, `memory.ts`), rather than duplicating logic inside test code.

### Legacy Evaluation Notice
The existing ANIMA prompt study (`src/evals/image-prompt-study/`) and sidecar simulation corpus (`src/evals/sidecar-sim/`) are legacy artifacts evaluating the retired ANIMA-driven prompt compiler according to subjective cinematic/stability rubrics. They do not evaluate V3.7.6 source parity and are superseded by this suite.

---

## Source-of-Truth & Provenance Traceability

All 5 evaluation categories (26 test cases, 82 assertions) trace directly to exact line ranges in the decompiled V3.7.6 source:

### 1. Schema & Structural Tolerance (`category: "schema"`)
- **JSON Key Typo Tolerance (`fixJsonKeys`)**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 1110–1149.
  - *Behavior*: Calculates `levenshteinDistance` against `KNOWN_JSON_KEYS` (27 known keys). Repaired when distance $\le 2$ (e.g. `scens` $\rightarrow$ `scenes`, `apperance` $\rightarrow$ `appearance`).
- **Standalone Gender Tag Stripping (`filterStandaloneGenderTags`)**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 972–976.
  - *Behavior*: Strips exact standalone matches of `boy`, `girl`, `1boy`, `1girl` from character `appearance`, but strictly retains composite tags like `tall boy`, `schoolgirl`, `cat girl`, and `tomboy`.
- **Character Normalization Contract (`normalizeCharacterData`)**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 960–1015.
  - *Behavior*:
    - Key concatenation order: `label`, `name` (canon only), `age`, `appearance`, `body`, `attire`, `expression`, `action`, `sex`, `text`, `supplement`.
    - If `originalReference` is enabled and character is not an original character (does not contain `(oc)`), injects character name immediately following `label`.
    - Identity fingerprint (`char.identity`) extracts only `label, age, appearance, body, attire` for character appearance memory; never includes name, expression, action, or supplement.
- **Sex Field Omission Contract**:
  - *Source*: `references/v376/Card.Image.axLLM.txt` line 161.
  - *Behavior*: In NSFW mode (`toggle_Card.Nsfw == "1"`), the `sex` attribute is optional when sexual activity is not occurring; missing `sex` field parses cleanly without error.
- **Markdown Fences & Trailing Commas (`extractCardImageJson`)**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 1150–1180.
  - *Behavior*: Strips markdown code blocks (````` ```json ... ``` `````) and recovers trailing commas present in LLM responses.

### 2. Instruction Conditional Coverage (`category: "instructions"`)
- **Macro Conditional Integrity**:
  - *Source*: `references/v376/Card.Image.axLLM.txt` lines 1–350.
  - *Behavior*: Renders all 48 combinatorial permutations of `mode` (illustration, asset, comic), `nsfw` (false, true), `supplement` (false, true), and `text` (off, free, english, japanese). Verifies 0 unresolved `{{...}}` macro tags (except runtime `{{user}}`) and 0 `<%...%>` tags.
- **Mode Conditional Instructions**:
  - *Source*: `references/v376/Card.Image.axLLM.txt` lines 12–80.
  - *Behavior*:
    - Illustration: Standard multi-character framing rules (*"Prefer closer framing over wide shots"*).
    - Asset (Mode 1): Enforces *"One shot per selected paragraph, each containing exactly one visible character."* and `Character limit: **Max 1 character per shot**.`
    - Comic (Mode 2): Outlines page layout, `placement`, and `panels` composition.
- **Feature Conditional Instructions**:
  - *Source*: `references/v376/Card.Image.axLLM.txt` lines 150–250.
  - *Behavior*:
    - NSFW: `sex` attribute instructions included when enabled; omitted when disabled.
    - Supplement: Natural language guidance (*"If tags are insufficient to convey the scene's appearance..."*) included when enabled; omitted when disabled.
    - Text: Speech bubble and dialogue instructions included for `english`/`japanese`; omitted when `off`.
    - Quote: Quote instructions included when enabled; omitted when disabled.
- **Core, Format, Preprocess & Input Keyword Pipelines**:
  - *Source*: `references/v376/Card.Image.Format.txt`, `references/v376/Card.Core.axLLM.txt`, `references/v376/Card.Preprocess.Prompt.txt`.
  - *Behavior*:
    - Format instruction emits Mode 0/1 schema vs Mode 2 comic schema.
    - Preprocess instruction injects dynamic shot bounds (`Generate 1–4 shots total.`).
    - Input keyword replacements convert `loli` $\rightarrow$ `young girl` and `shota` $\rightarrow$ `young boy` prior to LLM submission.

### 3. Prompt Assembly & Separator Delimiters (`category: "prompt"`)
- **Scoped Deduplication (`removeDuplicateTags`)**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 1660–1675.
  - *Behavior*: Deduplicates tags case-insensitively strictly within each pipe segment (` | `). Tags repeated across different character segments or panel segments are preserved.
- **Output Keyword Replacements (`extractLLMPrompts`)**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 1320–1360.
  - *Behavior*: Replaces `from front` $\rightarrow$ `straight-on`, `young girl` $\rightarrow$ `loli`, `young boy` $\rightarrow$ `shota` across `setupPrompt` and `charPositive`.
- **Preset DSL Parsing (`extractPresetSections`)**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 1597–1645.
  - *Behavior*: Splits `[Positive]` and `[Negative]` blocks case-insensitively, handling presets with or without markers.
- **Mode 0 (Illustration) Prompt Assembly**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 1597–1687, 1689–1850.
  - *Behavior*:
    - Pipe separator (` | `) with NAI syntax escapes parentheses `\(` and `\)`.
    - Newline separator (`,\n\n`) merges preset, setup, and characters with double newlines.
    - ComfyUI syntax preserves parentheses and converts curly braces `{` $\rightarrow$ `(`, `}` $\rightarrow$ `)`.
- **Mode 1 (Asset) Prompt Assembly**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 1795–1801.
  - *Behavior*: Prepends `portrait, cowboy shot, white background, simple background, ` and appends `, looking at viewer`.
- **Mode 2 (Comic) Prompt Assembly**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 1700–1725, 1785–1793.
  - *Behavior*: Emits `comic panel, manga panel, ultra complexity`, joins page layout and formatted panel sequences (`panel 1, ... | panel 2, ...`).
- **Custom Affix & Quality Tags Assembly**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 1845–1847, 1876–1878, and `module.json` `customModuleToggle`.
  - *Behavior*:
    - `CustomPos` (artist tag prefix): prepended to positive prompt with `commaStr`.
    - `CustomNeg` (quality tag suffix): appended to positive prompt with `commaStr` (source caption: *"Tag attached to the very end of [Positive] in the preset"*).
    - `customNegative`: appended to negative prompt.
- **NovelAI V4 Native Character Channels (`PromptSep == "2"`)**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 1735–1770, 1883–1900.
  - *Behavior*:
    - When `#charNegParts == #charPosParts`: 1:1 aligned character negatives assigned to each channel.
    - When counts mismatch: all character negatives are concatenated with `", "` and appended to `baseNeg`; character channels receive `negative = ""`.

### 4. Codec Roundtrips & Request Framing (`category: "codec"`)
- **Codec Roundtrips**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 16–77, 178–260.
  - *Behavior*:
    - Mode 0 Plaintext: placeholder tokens (`BP1`–`BP10`, `SE1`–`SE20`) resolved to English terms on prompt encode.
    - Mode 1 Placeholder: placeholders preserved on encode, resolved on decode.
    - Mode 2 Base64: symmetric base64 encode/decode, mixed-text response recovery.
    - Mode 3 Atbash: symmetric Latin alphabet inversion ($A \leftrightarrow Z$, $a \leftrightarrow z$).
- **XML Prefill Parser (`parsePrefillToMessages`)**:
  - *Source*: `references/v376/Card.Prefill.Prompt.txt` lines 1–18.
  - *Behavior*: Maps `<human>` $\rightarrow$ `user`, `<assistant>` $\rightarrow$ `char`, `<system>` $\rightarrow$ `system`. Supports unclosed tags (capturing to end of string) and filters non-role XML tags.

- **Context Prefill Framing Toggle (`prefillEnabled` true vs false)**:
  - *Source*: `references/v376/Card.Prefill.Prompt.txt` lines 1–18, `references/v376/trigger_runtime.lua` lines 640–645 / 850–855.
  - *Behavior*: When `options.prefillEnabled` is `true`, `buildV376Context` appends the 3 XML prefill turns (`<human>`, `<assistant>`, `<human>`) to the absolute end of the outbound messages. When `false`, 0 prefill turns are appended.

### 5. Character Memory Lifecycle (`category: "memory"`)
- **Memory Serialization & Backward-Compatible Parsing**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 265–290.
  - *Behavior*: Serializes `tags|||negTags|||depth`. Tolerates backward-compatible 2-part `tags|||depth` and 1-part legacy `tags`.
- **Turn Transition & Depth Decay (`updateV376Memory`)**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 295–325.
  - *Behavior*: Unmentioned characters decrement depth ($depth = depth - 1$). Returning characters reset to `maxDepth` (5) and update identity tags while preserving negative tags.
- **Baseline Reference Generation (`buildAppearanceReference`)**:
  - *Source*: `references/v376/trigger_runtime.lua` lines 327–350.
  - *Behavior*: Emits alphabetically sorted character names in the `Characters:` header. For expired characters ($depth == 0$), retains names in header but suppresses bullet tag lines to prevent tag bleeding.

---


---

## Explicit Limitations & Live Scope Boundary

Passing 82/82 assertions indicates **100% deterministic offline fixture compliance** against frozen decompiled reference logic. It **does not** constitute proof of complete live runtime parity or universal source parity. Specifically:

1. **Host Spindle Context Loading vs Static Compilation**:
   - The offline suite verifies static context and prompt assembly given populated inputs.
   - Dynamic live host fetching (loading `toggle_Card.UserInfo` user persona, `toggle_Card.CharInfo` character description, and `toggle_Card.Lorebook` lorebook entries via Spindle host APIs) operates during live execution and is tested separately by integration suites.
2. **Offline Fixtures vs Live Model Generation**:
   - Offline tests evaluate compiler output from frozen benign fixtures. They do not simulate live LLM generation failure modes, non-deterministic token generation, or network socket streaming.
3. **No Aesthetic or Cinematic Quality Claims**:
   - Passing assertions verifies mechanical fidelity to decompiled Lua functions and lorebook text. It does not make subjective claims regarding image quality, style quality, or prompt aesthetics.

## Directory Layout
```
src/evals/v376-parity/
├── README.md                 # Evaluation documentation and Lua line traceability
├── types.ts                  # Parity runner and fixture type contracts
├── engine.ts                 # Offline deterministic evaluation engine (all 5 suites)
├── cli.ts                    # Native Bun CLI runner (human report or --json)
├── parity.test.ts            # Automated Bun test integration (12 tests, 50 assertions)
└── fixtures/
    ├── fixtures.json         # Complete tracked parity fixtures (no tmp-audit dependency)
    ├── fixtures-loader.ts    # Typed fixture loader
    ├── golden-scenes.ts      # Frozen scene payloads & structural recovery fixtures
    ├── golden-codecs.ts      # Plain, Placeholder, Atbash, and Base64 vectors
    └── golden-prompts.ts     # Exact expected prompts across all modes and separators
```

---

## Running Parity Evaluations

### Human-Readable Report
```bash
bun run eval:v376
# Or directly:
bun run src/evals/v376-parity/cli.ts
```

### Verbose Mode (Detailed Assertions & Source References)
```bash
bun run src/evals/v376-parity/cli.ts --verbose
```

### Filtering by Category or Pattern
```bash
# Run only prompt assembly checks:
bun run src/evals/v376-parity/cli.ts --category=prompt

# Run only memory checks:
bun run src/evals/v376-parity/cli.ts --category=memory

# Filter cases by substring:
bun run src/evals/v376-parity/cli.ts --filter=mismatched
```

### JSON Output for Machine Verification
```bash
bun run src/evals/v376-parity/cli.ts --json
```

### Automated Bun Tests
```bash
bun test src/evals/v376-parity/parity.test.ts
```
