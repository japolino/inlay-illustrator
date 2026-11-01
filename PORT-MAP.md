# Inlay Illustrator (Asset Maid 0.9.88 Port) Architecture & Port Map

This document establishes the comprehensive architectural audit and mapping between **Asset Maid 0.9.88** (RisuAI extension bundle, `AssetMaid.pretty.js`, 181,445 lines) and **Inlay Illustrator 0.10.x** (Lumiverse Spindle extension worktree on branch `testing`).

---

## 1. Executive Summary & Architectural Paradigm

### 1.1 Background & Transformation
Inlay Illustrator 0.10 completely replaces the legacy Lightboard pipeline (0.9.x) with a clean, modular port of Asset Maid 0.9.88. Asset Maid was originally authored as a massive, single-file IIFE bundle targeting RisuAI's plugin system (React 19, Radix UI, localLore carrier hacks, direct fetch/electron bridges).

Inlay Illustrator reorganizes this codebase into a four-layer architecture suited for Lumiverse's Spindle extension runtime:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Frontend Layer (Preact)                         │
│  Overlay Shell · Workspace · Roster · Settings · Chat Edge / Inset     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Spindle RPC (protocol: 1) / Fetch Bridge
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Shared Contract (`src/shared/contract`)             │
│  Strict Types · Defaults · Normalizers · History Tree · RPC Defs       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Pure In-Memory Types
┌───────────────────────────────────▼────────────────────────────────────┐
│                        Backend Layer (`src/backend`)                   │
│  Services (Storage/LLM/Images/Sources) · Pipeline · Analysis · RPC     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Dependency Injection (amEnv / Adapters)
┌───────────────────────────────────▼────────────────────────────────────┐
│                         Pure Engine (`src/engine`)                     │
│  Generated Slices (asset-maid-core.ts) · V5/V4.5 Facades · Compose     │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Core Porting Strategies
1. **Verbatim Slicing with AST Closures**:
   Pure mathematical, parsing, prompt compilation, and analysis algorithms are not re-implemented from scratch. Instead, an AST slicing pipeline analyzes the original bundle's scope graph, extracts dependency closures, rewrites nondeterministic clock/RNG access (`Date.now`, `Math.random`, `crypto`) through an injected `amEnv` fixture, and generates verbatim TypeScript/JavaScript slices (`asset-maid-core.ts`, `analysis-core.ts`, `auto-core.ts`).
2. **Typed Facades over Verbatim Cores**:
   Engine submodules (`v5`, `v45`, `compose`, `continuity`, `text`, `context`) act as strictly typed facades around the sliced exports. They provide typed interfaces, clean error ergonomics, and default wiring without altering algorithmic behavior.
3. **Contract Isolation**:
   `src/shared/contract` defines data shapes, validation logic, history tree commands, and the RPC protocol with zero dependencies outside itself. Parity fixtures recorded directly from the original bundle ensure 100% bug-for-bug and feature-for-feature equivalence.
4. **Host Platform Adaptation**:
   RisuAI-specific storage hacks (`chat.localLore` with `@@dont_activate`, Risu chat stores) are migrated to Spindle's `userStorage` JSON documents (`storage.ts`). Network transports (NovelAI API keys, LLM endpoints) are delegated to Lumiverse Connection Profiles (`llm.ts`, `images.ts`).

---

## 2. Comprehensive Bundle Mapping Table

Below is the definitive cross-reference between original Asset Maid concepts, bundle line anchors (`AssetMaid.pretty.js`), minified identifiers, and Inlay Illustrator modules.

### 2.1 Engine Core & Prompt Pipeline (`src/engine`)

| Asset Maid Concept | Bundle Line Anchors | AM Identifiers | Inlay Illustrator Module | Implementation Type | Description |
|---|---|---|---|---|---|
| **NovelAI V5 Raw Config & Validation** | 29–1644 | `uV`, `qAe`, `y1e`, `b1e`, `_i`, `p3`, `np`, `dg` | `src/engine/v5/catalog.ts`, `core/asset-maid-core.ts` | **Sliced** (`asset-maid-core.ts`) + Typed Facade | Raw schema validation, canonical JSON stringification (`p3`), FNV-1a 64-bit hashing (`np`), built-in config table (`dg`). |
| **NovelAI V5 Catalog Compiler** | 2059–2387 | `E1e`, `uF`, `_re` | `src/engine/v5/catalog.ts` | **Sliced** + Typed Facade | Compiles raw V5 catalog into executable rule engine and lookup tables. |
| **NovelAI V5 Rule Engine & Scene Compiler** | 44017–45710 | `Jx`, `s8e`, `_8e`, `I8e` | `src/engine/v5/runtime.ts` | **Sliced** + Typed Facade | Condition evaluation (`Jx`), phased rule execution (`s8e`), scene draft synthesis (`_8e`), scene compiler (`I8e`). |
| **NovelAI V5 Prompt Projection & Plan** | 47085–47150 | `uFe`, `gFe`, `Dht` | `src/engine/v5/compose.ts` | **Sliced** + Typed Facade | Projects scene state to prompt components, serializes plans, builds executed prompt plans. |
| **NovelAI V5 Analyzer & Messages** | 11660–117490 | `abe`, `nX`, `rX`, `bPe`, `Bgt`, `wgt`, `Egt` | `src/engine/v5/analyzer.ts` | **Sliced** + Typed Facade | Prepares analyzer instructions, modules, prompt presets (`bPe`), split analysis runner, and wire payload converter (`KE`). |
| **NovelAI V5 User Directions & Presets** | 6046–6140 | `qgt`, `RPe`, `Td` | `src/engine/v5/types.ts`, `shared/contract/data/v5-directions.json` | **Sliced** + Extracted JSON | Resolves user directions, image ratio presets, scene presets, camera presets. |
| **NovelAI V4.5 Catalog & Rule Runtime** | 11758, 42061–42150 | `vW`, `LLe`, `ute`, `DLe` | `src/engine/v45/catalog.ts` | **Sliced** + Extracted JSON | Compiles V4.5 catalog (`vW`), initializes rule runtime (`DLe`), default catalog lookup (`ute`). |
| **NovelAI V4.5 Staged Analyzer** | 82079–82500, 114878 | `KQe`, `BQe`, `$et`, `Ttt`, `VQe`, `Tht` | `src/engine/v45/analyzer.ts` | **Sliced** + Typed Facade | Single-stage ($et), multi-stage (KQe), revision (BQe) requests, parsing, repair, and orchestration. |
| **Prompt Compiler & Rule IR** | 119794–120150 | `pyt`, `myt` | `src/engine/compose/prompt-plan.ts` | **Sliced** + Typed Facade | Compiles analyzer output and rule-IR into unified `PromptPlan`. |
| **Provider Prompt Codecs** | 119850–120120 | `g2`, `wmt`, `vmt`, `p7`, `Oge`, `bmt`, `Hge` | `src/engine/compose/provider-prompt.ts` | **Sliced** + Typed Facade | Formats prompts for NovelAI structured tags (`vmt`) and Anima flat prompts (`Hge`/`p7`). |
| **Prompt Weights & Spacing** | 22220–22250, 24600 | `s2`, `Put`, `Cut`, `Mu`, `Aa` | `src/engine/compose/weights.ts` | **Sliced** + Typed Facade | Applies NovelAI weights `{tag}`/`[tag]`, non-artist prompt weighting, and spacing. |
| **NSFW Tag Policies & Coordinates** | 20600–20650 | `C7`, `d7`, `c7`, `hge` | `src/engine/compose/nsfw.ts`, `coordinates.ts` | **Sliced** + Typed Facade | NSFW prefix prepending, AI choice coordinate extraction and character captions. |
| **Size, Count & Batch Policy** | 20598–20625, 21379 | `Gf`, `SW`, `cE`, `Pye`, `c2` | `src/engine/compose/size-count-seed.ts` | **Sliced** + Typed Facade | Resolves count constraints, clamps requested sizes, manages PRNG seed generation. |
| **Batch Execution & Queues** | 113736–114105, 120220 | `nht`, `lht`, `Iyt`, `Sbe` | `src/engine/compose/batch.ts`, `src/engine/engine.ts` | **Sliced** + Typed Facade | Session creation, provider queues, parallel interval throttling, generation batch dispatcher. |
| **Visual Continuity Engine** | 42761–43370 | `K8`, `Pte`, `$g`, `TA`, `iKe`, `z9e`, `fKe`, `mKe`, `Ore`, `ODe`, `vN`, `D5e` | `src/engine/continuity/state.ts`, `update.ts`, `apply.ts` | **Sliced** + Typed Facade | Checkpoint push (`K8`), reconciliation (`Pte`), state accumulation (`TA`/`iKe`), deferred continuity (`mKe`). |
| **Continuity Storage Bridge** | 42968–43355 | `hDe`, `Ete`, `NBe`, `OBe`, `Wv`, `zne`, `Lne`, `Tne` | `src/engine/continuity/storage.ts` | **Sliced** + Typed Facade | Serializes/reads continuity state to/from chat documents (`NBe`/`OBe`/`Wv`). |
| **Paragraph Slots & Token Markup** | 157540–157800 | `X0e`, `hSt`, `nIe`, `fH`, `H2` | `src/engine/text/slots.ts` | **Sliced** + Typed Facade | Paragraph splitting (`X0e`), slot IDs (`hSt`), markup stripping (`fH`), native asset detection (`H2`). |
| **Lenient JSON Parser** | 11080–11120 | `iQe` | `src/engine/text/json.ts` | **Sliced** + Typed Facade | Lenient JSON parsing for LLM responses, stripping code fences, trailing commas, single quotes. |
| **Analyzer Context Assembly** | 24700–24950, 47000 | `MAt`, `NAt`, `y_e`, `E1t` | `src/engine/context/context.ts` | **Sliced** + Typed Facade | Builds full context inputs seen by V4.5 and V5 analyzers (roster, lore, continuity, chat history). |
| **Engine Dependency Injection** | Host environment | `amEnv` | `src/engine/core/env.ts` | **Manually Designed** | DI layer replacing globals (`Date.now`, `Math.random`, `crypto`, `performance`) for deterministic testing. |

---

### 2.2 Shared Contract & Data Specifications (`src/shared/contract`)

| Asset Maid Concept | Bundle Line Anchors | AM Identifiers | Inlay Illustrator Module | Implementation Type | Description |
|---|---|---|---|---|---|
| **Deep Merge & Defaults Diff** | 24900–25000 | `VW`, `iv`, `kE`, `qk` | `src/shared/contract/common.ts` | **Manually Ported** (Parity Tested) | Deep equality, diff against defaults, FNV-1a hash functions, unique identifier generators. |
| **Global Config Normalizer** | 20500–20950 | `fEe`, `Y0`, `Ns`, `W0`, `aL` | `src/shared/contract/config.ts` | **Manually Ported** (Parity Tested) | Normalizes `InlayConfig`, sets defaults, handles legacy key migrations, clamps NovelAI params. |
| **CharX Overrides & Scopes** | 24584–24900 | `ki`, `xE`, `ONe`, `jNe`, `NNe`, `ENe`, `RNe` | `src/shared/contract/config.ts` | **Manually Ported** (Parity Tested) | Resolves per-character config overrides vs global defaults using field revision tracking. |
| **Appearance Catalog & Forms** | 2410–2590, 25068–25146 | `Wb`, `go`, `ds`, `BL`, `Pg`, `Jf`, `HL`, `BY`, `HY`, `UY` | `src/shared/contract/character.ts` | **Manually Ported** (Parity Tested) | Appearance catalog (`Wb`), FormCollection CRUD, outfit operations, prompt compilation (`Si`). |
| **Custom Characters & Recognition Keys** | 24600–24700 | `wTe`, `_x`, `gD`, `kP`, `vw` | `src/shared/contract/character.ts` | **Manually Ported** (Parity Tested) | Custom character validation, NFKC key splitting, lorebook recognition key extraction. |
| **Image History Tree** | 28000–29300 | `hBe`, `Zne`, `IBe`, `PR`, `CR`, `Xne` | `src/shared/contract/history.ts` | **Manually Ported** (Parity Tested) | Pure command reducer (`Zne`), 69 invariant validation issue codes (`hBe`), 99-cap pruning (`CR`). |
| **History Projections & Store** | 28080–28300 | `NR`, `lK`, `uN`, `commitRevision` | `src/shared/contract/history.ts`, `chat.ts` | **Manually Ported** (Parity Tested) | Projections between linear store and history tree; revision commit logic. |
| **Storage Paths & Migrations** | 20800–20900 | `asset_maid:*`, `local:*` | `src/shared/contract/storage.ts` | **Manually Ported** | Maps RisuAI storage keys to Spindle `userStorage` filesystem paths; schema migration hooks. |
| **RPC Protocol Definitions** | Communication layer | Plugin messaging | `src/shared/contract/rpc.ts` | **Manually Designed** | Request/response/event discriminated unions and type guards for Spindle RPC protocol v1. |
| **Chat DOM Markup Contract** | 165000+ | Chat DOM injection | `src/shared/contract/chat-dom.ts` | **Manually Ported** | Specifications for baked illustration blocks, attributes, suppression markers, and interceptor stripping. |
| **Fetch Bridge Contract** | Electron / web bridge | Host image fetch | `src/shared/contract/bridge.ts` | **Manually Designed** | Bridge allowing backend to fetch REST JSON without a Spindle API via frontend context. |

---

### 2.3 Backend Services & Pipeline (`src/backend`)

| Asset Maid Concept | Bundle Line Anchors | AM Identifiers | Inlay Illustrator Module | Implementation Type | Description |
|---|---|---|---|---|---|
| **Backend Runtime Boot** | 180714–180783 | `LOt` | `src/backend/runtime.ts`, `src/backend.ts` | **Manually Ported** | Bootstraps per-user runtime, mounts Spindle interceptor, binds host events, initializes RPC router. |
| **Storage Service** | Local storage / IndexedDB | `saveData`, `loadData` | `src/backend/services/storage.ts` | **Manually Ported** | Spindle `userStorage` client: FIFO queue writes, split config diffs, character docs, migrations. |
| **LLM Service** | 28900–29400 | Analyzer transport | `src/backend/services/llm.ts` | **Manually Ported** | Connects to Lumiverse LLM connection profiles; handles reasoning DTO, retries, JSON mode fallback. |
| **Image Generation Service** | 120220+ | Provider dispatch | `src/backend/services/images.ts` | **Manually Ported** | Dispatches to NovelAI/ComfyUI/generic providers; coordinates serialization and retry queues. |
| **Image Bytes Bridge** | Web/blob URL bridge | Image bytes retrieval | `src/backend/services/image-bytes.ts` | **Manually Ported** | Serves reference and gallery image bytes from `spindle.images.readBinary` and `userStorage`. |
| **Sources & Roster Service** | Risu character roster | Character / lore queries | `src/backend/services/sources.ts` | **Manually Ported** | Queries Lumiverse characters, personas, worldbooks, and image galleries to build AM source models. |
| **Chat Illustration Controller** | Chat pipeline loop | Pipeline trigger / locks | `src/backend/pipeline/controller.ts` | **Manually Ported** | Manages generation locks, job queues, automatic triggers, host event handlers (`GENERATION_ENDED`). |
| **Turn Generation Orchestrator** | 114878, 118896 | Orchestrator runs | `src/backend/pipeline/generate.ts` | **Manually Ported** | Prepares slots, builds analyzer context, runs engine orchestrator, commits history revisions. |
| **Provider Adapters** | 20554+ | `W0`, `IMAGE_PROVIDER_TABLE` | `src/backend/pipeline/providers.ts` | **Manually Ported** | Adapts NovelAI, ComfyUI, and generic host image generators to the engine provider interface. |
| **Interceptor & Markup Baking** | 157500+ | `iq`, `F5`, DOM injection | `src/backend/pipeline/markup.ts`, `inlay-content.ts` | **Manually Ported** | Strips baked blocks during LLM prompt building; encodes native asset suppression; bakes illustrations into chat. |
| **Free Character & Outfit Generation** | 168426, 179282 | `a1t`, `gOt`, `yOt` | `src/backend/pipeline/auto.ts`, `core/auto-core.ts` | **Sliced** (`auto-core.ts`) + Adapted Bridge | Verbatim slice for auto character (`gOt`), auto outfit (`a1t`), initial outfit image (`yOt`). |
| **Pipeline Generation Records** | Chat sidecar metadata | Sidecar metadata | `src/backend/pipeline/records.ts` | **Manually Ported** | Persists sidecar `pipeline.json` storing generation records, prompt history, and zoom drafts. |
| **RPC Router & Handlers** | UI communication | Dispatcher | `src/backend/rpc/router.ts`, `handlers/*` | **Manually Ported** | Validates incoming RPC envelopes; routes core, chat, and workspace requests to backend modules. |

---

### 2.4 Asset Analysis Backend (`src/backend/analysis`)

| Asset Maid Concept | Bundle Line Anchors | AM Identifiers | Inlay Illustrator Module | Implementation Type | Description |
|---|---|---|---|---|---|
| **Analysis Slice** | 2400–6700, 168000+ | 120+ controllers | `src/backend/analysis/core/analysis-core.ts` | **Sliced** (`analysis-core.ts`) | Verbatim slice containing all AM prompt, reference, metadata, and reclassification controllers. |
| **Character Prompts Controller** | ~170000 | `iwt` | `src/backend/analysis/runs.ts`, `runs-more.test.ts` | **Sliced** + Adapted Bridge | Analyzes character visual traits from images and text evidence into Danbooru tags. |
| **Reference Images Controller** | ~171000 | `Awt` | `src/backend/analysis/assets.ts`, `runs.ts` | **Sliced** + Adapted Bridge | Analyzes reference images, handles visual grounding and tag extraction. |
| **Persona Analysis Controller** | ~172000 | `bwt` | `src/backend/analysis/runs.ts` | **Sliced** + Adapted Bridge | Analyzes user persona descriptions and avatar images. |
| **Asset Matching Controller** | ~173000 | `Mvt` | `src/backend/analysis/assets.ts`, `runs.ts` | **Sliced** + Adapted Bridge | Matches character assets to appropriate scene/outfit contexts. |
| **Metadata Extraction** | ~174000 | `Uwt`, `$vt` | `src/backend/analysis/runs.ts` | **Sliced** + Adapted Bridge | Extracts character metadata (`Uwt`) and artist metadata (`$vt`). |
| **Prompt Reclassification** | ~175000 | `sve`, `cve` | `src/backend/analysis/runs.ts` | **Sliced** + Adapted Bridge | Reclassifies user prompts into positive/negative tag groups with batch retries. |
| **Representative Asset Pick** | ~176000 | `ope`, `hvt` | `src/backend/analysis/assets.ts` | **Sliced** + Adapted Bridge | Selects the representative character image/avatar from candidate assets. |
| **CharX Regex Detector** | ~177000 | `Int`, `sH` | `src/backend/analysis/charx-regex.ts` | **Sliced** + Adapted Bridge | Builds regex detectors for custom script / CharX asset matching. |
| **Bridge Adapters** | Risu stores | `N`, `assetIndex` | `src/backend/analysis/bridge/*` | **Manually Ported** | Binds verbatim analysis controllers to `CharacterDocument` config store, asset index, and sessions. |
| **Workspace Operations** | Roster & custom character ops | Workspace actions | `src/backend/analysis/workspace.ts` | **Manually Ported** | Implements custom character creation, roster sync, and prompt editing. |
| **Outfit Generation Sessions** | Outfit generation UI | Outfit workflows | `src/backend/analysis/outfit.ts` | **Manually Ported** | Drives multi-candidate outfit generation sessions and outfit image persistence. |

---

### 2.5 Frontend UI & Chat Integration (`src/frontend`)

| Asset Maid Concept | Bundle Line Anchors | AM Identifiers | Inlay Illustrator Module | Implementation Type | Description |
|---|---|---|---|---|---|
| **Overlay App Shell** | 94000–96000 | Main layout | `src/frontend/overlay/App.tsx`, `controller.tsx` | **Manually Ported** (Preact) | Mounts full-screen overlay via `app_manipulation`, manages Escape capture, tabs, and modals. |
| **Scoped CSS Architecture** | 165843+ (Tailwind string) | CSS theme | `src/frontend/overlay/styles/*`, `src/build/*` | **Manually Designed** | Tailwind v4 build-time compiler + selector scoper (`.ii-am-root`), CSS resets, CSS variable mappings. |
| **Workspace Tab (Assets)** | ~98000–103000 | Asset manager | `src/frontend/overlay/workspace/assets-tab.tsx` | **Manually Ported** (Preact) | Character image gallery, avatar assignment, crop editor, reference bindings. |
| **Workspace Tab (Prompts)** | ~104000–110000 | Prompt manager | `src/frontend/overlay/workspace/prompts-tab.tsx` | **Manually Ported** (Preact) | Visual form editor, outfit manager, base prompt tagging, negative prompts. |
| **Workspace Tab (Outfits)** | ~111000–114000 | Outfit builder | `src/frontend/overlay/workspace/outfits.tsx` | **Manually Ported** (Preact) | Generates novel outfits via LLM, candidate picker, outfit promotion. |
| **Workspace Tab (Artists)** | ~115000–118000 | Artist selector | `src/frontend/overlay/workspace/artists-tab.tsx` | **Manually Ported** (Preact) | NovelAI & Anima artist browser, style strength sliders, custom artist prompt overrides. |
| **Workspace Tab (Persona)** | ~119000–121000 | Persona manager | `src/frontend/overlay/workspace/persona-tab.tsx` | **Manually Ported** (Preact) | User persona visual profiles, gender overrides, chat-scoped persona binds. |
| **Roster Sidebar & Rail** | ~96500–98000 | Roster view | `src/frontend/overlay/roster/*` | **Manually Ported** (Preact) | Left-hand character list, custom character creation, recognition keys editor. |
| **Settings Overlay** | ~122000–135000 | Settings tabs | `src/frontend/overlay/settings/*` | **Manually Ported** (Preact) | Analyzer connection, image provider config, NovelAI params, CharX regex, run logs. |
| **Chat Footer & Edge Controls** | ~140000–145000 | Chat UI overlay | `src/frontend/chat/*` | **Manually Ported** (Preact) | Mounts into chat messages: slot count toggles, regeneration buttons, history step buttons. |
| **Zoom Image Viewer** | ~150000–156000 | Zoom dialog | `src/frontend/zoom/*` | **Manually Ported** (Preact) | Full-screen image inspector, prompt inspector, seed copying, AI prompt editing, reroll controls. |
| **Floating Action Button (FAB)** | Launcher button | Overlay launcher | `src/frontend/fab.ts` | **Manually Ported** | Floating action launcher button positioned above the chat composer; auto-hides during drawer open. |
| **Composer Inset Tracking** | Layout positioning | Composer tracker | `src/frontend/composer-inset.ts` | **Manually Designed** | Measures Lumiverse input composer height to dynamically offset the FAB and mobile controls. |
| **Fetch Bridge Client** | Host bridge | Fetch client | `src/frontend/fetch-bridge.ts` | **Manually Designed** | Responds to backend JSON requests (gallery, model lists) using same-origin browser fetches. |

---

## 3. Slicing Pipeline Architecture & Configuration

A key technical accomplishment of this port is the deterministic slicing toolchain, which guarantees exact parity with the original minified bundle for complex algorithmic logic.

### 3.1 Toolchain Architecture
The slicer works in three phases using `acorn` and `eslint-scope`:
1. **AST Parsing & Scope Analysis**:
   Parses `AssetMaid.pretty.js` into an AST, extracts top-level statements within the primary IIFE, and computes variable definition/reference graphs.
2. **Closure Traversal**:
   Starting from explicit root identifiers (specified in `slice-config.json`), the tool traverses the dependency graph recursively, collecting all required declarations, internal helper functions, and write references (`writers`).
3. **Deterministic AST Rewriting**:
   - Nondeterministic global calls (`Math.random()`, `Date.now()`, `crypto`, `performance`) are rewritten to invoke properties on `amEnv` (`src/engine/core/env.ts`).
   - Identifiers are renamed to clean, readable names when specified in the config (`renames` map).
   - In `slice-analysis.mjs`, external dependencies (such as `vW` = `NOVELAI_V45_RAW_CATALOG`) are converted to clean ES module imports pointing to `src/engine/core/asset-maid-core`.

```
AssetMaid.pretty.js (181k lines)
        │
   [ acorn AST ]
        │
  [ eslint-scope ] ────> Dependency Closure (Roots -> Transitive Deps)
        │
  [ AST Rewriter ] ────> Global Environment Rewrites (Math.random -> amEnv.random)
        │          ────> Symbol Renaming (Minified -> Semantic Identifier)
        │          ────> External Module Imports Insertion
        ▼
Generated Verbatim Slices:
  - src/engine/core/asset-maid-core.ts (2,452 AST units)
  - src/backend/analysis/core/analysis-core.ts (851 AST units)
  - src/backend/pipeline/core/auto-core.ts (237 AST units)
```

### 3.2 Slice Manifests & Configurations

#### A. Engine Core Slice (`asset-maid-core.ts`)
- **Generator**: `src/engine/core/tooling/slice.mjs`
- **Config**: `src/engine/core/tooling/slice-config.json`
- **Output**: `src/engine/core/asset-maid-core.ts`
- **Manifest**: `scratch/engine/slice-manifest.json` (2,452 AST units, 142 top-level renamed exports)
- **Primary Roots**:
  - `y1e` (`validateNovelAIV5RawConfig`), `b1e` (`assertNovelAIV5RawConfig`)
  - `E1e` (`compileNovelAIV5Catalog`), `dg` (`NOVELAI_V5_RAW_CONFIG`)
  - `_re` (`createNovelAIV5RuleRuntime`), `I8e` (`createV5SceneCompiler`)
  - `uFe` (`buildV5PromptProjection`), `gFe` (`serializeV5PromptPlan`)
  - `Egt` (`createV5Analyzer`), `Ygt` (`createV5Orchestrator`)
  - `LLe` (`compileV45Catalog`), `DLe` (`createV45RuleRuntime`)
  - `KQe` / `BQe` / `$et` (V4.5 stage message builders)
  - `Ttt` (`createV45AnalyzerEngine`), `Tht` (`createV45Orchestrator`)
  - `pyt` (`createPromptCompiler`), `myt` (`buildRuleIRPromptPlan`)
  - `g2` (`formatProviderPrompt`), `vmt`, `Hge` (Prompt formatters)
  - `K8` / `Pte` / `z9e` / `fKe` (Visual continuity engine)
  - `X0e` (`splitParagraphSlots`), `iQe` (`parseLenientJson`)

#### B. Analysis Backend Slice (`analysis-core.ts`)
- **Generator**: `src/backend/analysis/core/tooling/slice-analysis.mjs`
- **Config**: `src/backend/analysis/core/tooling/slice-config.json`
- **Output**: `src/backend/analysis/core/analysis-core.ts`
- **Manifest**: `scratch/analysis-backend/slice-manifest.json` (851 AST units)
- **External Imports**: `NOVELAI_V45_RAW_CATALOG` imported from `src/engine/core/asset-maid-core`
- **Primary Roots**:
  - `iwt` (Character prompt analyzer)
  - `Awt` (Reference image analyzer)
  - `bwt` (Persona prompt analyzer)
  - `Mvt` (Asset matching controller)
  - `Uwt` (Character metadata extractor)
  - `$vt` (Artist metadata extractor)
  - `sve`, `cve` (Prompt reclassification controllers)
  - `ope` (Representative asset selector)
  - `Int` (CharX customscript regex detector)
  - Prompts and system instruction tables: `Wb`, `Yb`, `T1e`, `dPe`, `uPe`, `fPe`, `cPe`, `pPe`, `hPe`, `lPe`, `xat`, `x3`, `Cme`

#### C. Free Character / Outfit Slice (`auto-core.ts`)
- **Generator**: `slice-analysis.mjs`
- **Config**: `scratch/pipeline-backend/slice-config.json`
- **Output**: `src/backend/pipeline/core/auto-core.ts`
- **Manifest**: `scratch/pipeline-backend/slice-manifest.json` (237 AST units)
- **Primary Roots**:
  - `a1t` (`autoOutfit`)
  - `gOt` (`autoCharacter`)
  - `yOt` (Initial outfit image generator)
  - Core helpers: `ZAt`, `jE`, `Xf`, `Hgt`, `D2`, `Xgt`, `ki`, `Si`, `go`, `BY`, `Jf`, `Pg`, `MJ`, `YNe`

---

## 4. Architectural Deliberations: Sliced vs Manually Ported

| Architectural Area | Sliced Components | Manually Ported / Adapted Components | Rationale |
|---|---|---|---|
| **Catalog & Rules** | Rule AST compilation, evaluation conditions (`Jx`), phase loops (`s8e`), conflict resolution. | TypeScript types (`V5Rule`, `Catalog`), clean loader functions, fixture validation. | Algorithmic subtlety: matching NovelAI's complex priority rules is error-prone if re-implemented. |
| **Prompt Composition** | Provider codecs (`g2`, `vmt`, `Hge`), weight math (`s2`, `Put`), coordinate formatting (`c7`). | High-level `PromptPlan` builder types, provider enum mappings, option mergers. | Exact punctuation, token weight calculation, and character coordinate formatting must match byte-for-byte. |
| **Continuity** | Checkpoint reconciliation (`Pte`), state accumulation (`TA`/`iKe`), modifier updates (`Ore`). | Integration with Lumiverse chat store documents (`storage.ts`), swipe index tracking (`id@swipe`). | Complex state machines are preserved verbatim; storage representation is modernized. |
| **Data Contract** | *None* (all pure TS) | `normalizeConfig`, `normalizeFormCollection`, `validateHistoryTree`, `applyHistoryCommand`, `commitRevision`. | Clean code readability, exhaustive TypeScript typing, and elimination of obfuscated bundle artifacts in public contracts. Parity verified with 100% fixture coverage. |
| **Backend Services** | *None* | `StorageService`, `LlmService`, `ImageService`, `ImageBytesService`, `SourcesService`. | RisuAI plugin environment had completely different storage/network primitives. Lumiverse Spindle requires native service abstractions. |
| **Chat Pipeline** | Free character/outfit logic (`auto-core.ts`). | Pipeline lock coordinator (`controller.ts`), event interceptor (`markup.ts`), generation sidecar (`records.ts`). | Lumiverse uses interceptor hooks and Spindle events (`GENERATION_ENDED`), rather than RisuAI's beforeRequest/afterRequest callbacks. |
| **Analysis** | Analysis prompts, parsing, repair loops, Danbooru tag extractors (`analysis-core.ts`). | Store bridges (`bridge/*`), workspace RPC adapters (`workspace.ts`), job queue (`jobs.ts`). | Analysis controllers contain thousands of lines of delicate prompt engineering and response repair heuristics. Bridging their store access is vastly safer than rewriting them. |
| **User Interface** | *None* | Entire Preact application (`App.tsx`, `workspace/*`, `settings/*`, `chat/*`, `zoom/*`). | Asset Maid used React 19 + Radix UI inside RisuAI. Inlay Illustrator uses lightweight Preact with Tailwind v4 scoped CSS (`.ii-am-root`), fully adapted to Lumiverse themes and mobile screens. |

---

## 5. Dropped and Adapted Features (Scope Realignment)

In migrating from RisuAI to Lumiverse, certain legacy or external platform features were intentionally dropped or adapted:

### 5.1 Dropped Features
1. **Direct API Transports**:
   - Direct provider endpoints, custom headers, and API keys for LLMs/NovelAI in extension settings are dropped. Lumiverse manages API keys and endpoints securely via Connection Profiles.
2. **Chan Server & Vertex Direct Transports**:
   - Chan Server image provider and Vertex AI caching transports were removed. Lumiverse provides standard image generation and LLM connection profiles.
3. **LocalLore Storage Carriers**:
   - Asset Maid stored chat state in `chat.localLore` entries named `asset-maid:chat-data` prefixed with `@@dont_activate`. Inlay Illustrator stores clean JSON documents in Spindle's `userStorage` (`chats/<chatId>/chat-data.json`).
4. **Community Maid Library**:
   - The community sharing library and visitor/owner notice system were removed.
5. **PDF Analysis Transport**:
   - Direct binary PDF upload transport for LLM evidence was dropped; text and image inputs are used.
6. **Multi-Instance Locks**:
   - Multi-instance cross-tab election locks are obsolete because Spindle backend runs as a single service per user.
7. **Image PDF size limits (AM 0.9.90)**:
   - The 128 MiB page-image total / separate final PDF size check has no counterpart: there is no PDF analyzer request path.

### 5.2 Adapted Features
1. **Swipe Message Identity**:
   - Message IDs are generalized to `<messageId>@<swipeIndex>`, allowing distinct illustrations per swipe.
2. **Direct History Tree Persistence**:
   - In Asset Maid, the history tree was ephemeral and re-projected lossily from the flat chat store on reload. Inlay Illustrator persists the history tree directly, preserving entry/slot IDs, creation timestamps, and active revisions.
3. **CSS Isolation**:
   - The entire UI is scoped to `.ii-am-root` using a build-time Tailwind CSS scoper (`src/build/build-css.ts`), preventing style leaks into the Lumiverse host app.
4. **Drawer & Inset Integration**:
   - The UI coordinates with the Lumiverse drawer handle (hiding edge handles when open) and visual composer inset (`--ii-am-composer-inset`), ensuring controls never overlap the mobile keyboard or text bar.
5. **Deleting a character's own artist (AM 0.9.90 default style star)**:
   - AM sets the character's override to the literal "none" when its selected artist is deleted. The port lets the character follow the default style instead (deliberate divergence; the release notes do not mention it).
6. **NovelAI V5 Medium (AM 0.9.90)**:
   - The Medium model goes out as the host request `model` (Lumiverse's `rawRequestOverride` cannot replace the protected `model` key). AM deletes `cfg_rescale`, `qualityToggle` and `skip_cfg_above_sigma`; the override is a deep merge that cannot delete, so the port leaves them out of its override and the host's defaults stay (`cfg_rescale` 0, `qualityToggle` true, `skip_cfg_above_sigma` null). Empty negatives are sent explicitly because the host substitutes a default UC for an empty `negativePrompt`.
7. **Removed built-in art styles (AM 0.9.90)**:
   - 0.9.90 ships only the `none` art style. AM simply drops the two former built-ins (`detail_anime_illustration_style`, `comic_page_illustration_style`); the port keeps the look instead: stored entries of them become user styles (English titles unless renamed), and a default or a character's own selection naming one without a stored entry recreates it as a user style with the old prompt / negative (`migrateLegacyBuiltinArtists`, `artists-global` v2).
8. **Maid Atelier storage (AM 0.9.90)**:
   - AM keeps `presetCatalog.atelier`, `runtime.instructionChanges`, `runtime.freeGenerationLibrary` and `runtime.analysisExecution` in its settings domain. The port stores the first three plus the execution mode / controls in `config/atelier.json` (atelier.* RPCs; `config.update` refuses those fields). The chat toolbar resolution / AI coordinates stay in `runtime.analysisExecution` of the settings (same split as the toolbar UI).
   - Document conflicts report `expectedRevision` / `actualRevision` (plus the touched document ids), not AM's base-vs-stored catalog diff: the UI keeps the base catalog it rendered.
   - New items get English default names ("New preset", "New guideline", "New ratio guideline", "New character guideline", "New outfit guideline", "<name> copy"); error messages are English with the Korean original in `messageKo`.
   - Legacy directions: the text a user wrote in the 0.9.89 V5 directions (own presets, edited or extended built-ins, changed ratio sizes) is imported once into the guideline library when `config/atelier.json` is first created, under the title "Previous directions", and the previously selected preset stays selected (an unchanged built-in POV / ensemble / comic selection maps to the provided guideline). AM only offers this as a manual import; `atelier.instructions.importLegacyDirections` repeats it on request. `novelai.v5UserDirections` stays readable.
9. **`presetCatalog.rawJson` (AM 0.9.90)**:
   - The dead custom V4.5 raw catalog is copied once to `config/legacy/preset-raw-catalog.json` and dropped from the settings on the next settings write.
10. **AI selection history (AM 0.9.90 zoom)**:
   - AM reads the compact analyzer record from the PNG metadata. The port keeps it in the pipeline sidecar (`GenerationRecord.analysis`, records above 512 KiB are stored as omitted) and `zoom.getDetails` returns `selectionSummary` with English fallback labels.

---

## 6. Test Suite, Verification & Quality Assurance

The ported codebase is verified by an exhaustive automated testing suite and build pipeline.

### 6.1 Verification Commands
- **Unit & Parity Tests**: `bun test`
- **Full Production Build**: `bun run build` (runs CSS compilation, scoping check, typecheck, and ESM bundling)
- **Typecheck Only**: `bun run typecheck`
- **Lint/Verify**: `bun run verify`

### 6.2 Test Suite Metrics
```
Total Test Files: 63 (all in src/**)
Total Passing Tests: 1,146
Total Assertions: 6,578 expect() calls
Test Suite Duration: ~14.6s
Test Failures: 0
```

### 6.3 Test Distribution by Area
- `src/engine/**` (14 test files):
  - Catalog hash verification against original bundle (`v5-catalog-hashes.json`).
  - V5 and V4.5 prompt compilation, rule execution, and prompt plan serialization against recorded bundle fixtures (`prompt-plans-*.json`, `v45-pipeline-*.json`).
  - Continuity state transitions and checkpoint reconciliation sequences.
  - Slot splitting and lenient JSON parsing corner cases.
  - End-to-end engine generation runs matching Asset Maid outputs (`e2e.*.json`).
- `src/shared/contract/**` (6 test files):
  - Config normalization parity tests (`config-parity.json`).
  - Character document and form operation parity tests (`character-parity.json`).
  - History tree validator and command reducer parity tests (`fixtures/history/*.json`).
  - Storage path encoding and migration tests.
- `src/backend/**` (24 test files):
  - In-memory mock Spindle host (`fake-host.ts`) and mock services (`fake-services.ts`).
  - Chat pipeline lifecycle: auto-illustration, swipe switching, deletion pruning, regeneration.
  - Interceptor markup stripping and idempotent re-baking.
  - Analysis controllers and workspace RPC handler test suites.
- `src/frontend/**` (14 test files):
  - Happy-DOM headless component tests for Overlay, Workspace tabs, Roster, Settings, and Zoom viewer.
  - Chat side controls, FAB positioning, and composer inset measurements.
  - RPC client state layer integration.
- `src/integration.test.ts` (1 test file):
  - End-to-end boundary test linking frontend `AppController` with real backend runtime over fake host services.
- `src/build/css-scope.test.ts` (1 test file):
  - Asserts no un-scoped Tailwind CSS rule leaks beyond `.ii-am-root`.

### 6.4 Build Artifacts
Running `bun run build` produces:
1. `overlay.generated.css`: Scoped Tailwind v4 styles (~95.5 KB).
2. `dist/backend.js`: Unminified ESM bundle for debuggability (~2.96 MB).
3. `dist/frontend.js`: Minified (whitespace + syntax) Preact bundle (~0.89 MB).
