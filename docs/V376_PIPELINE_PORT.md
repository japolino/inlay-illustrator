# V3.7.6 image-pipeline port

## Scope

The source module, not the retired ANIMA planner, defines new image prompts.
This replaces the active parser, semantic instructions, scene selection, and
prompt assembly. It is not an optional experimental backend.

Chat HTML, progressive image layout, FAB, modals, gallery, and lightbox remain
outside the rewrite. Existing saved images and flat-prompt rerolls remain
compatible. A legacy flat prompt does not contain enough information to invent
native per-character channels; rerunning the sidecar can create new structured
data instead.

## Source and ownership

The original module lorebooks and Lua runtime are preserved under
`references/v376/`. `PROVENANCE.md` records content hashes and source locations.
The new implementation lives under `src/backend/v376/`, with the existing
`src/backend/generation.ts` serving as the host lifecycle and display adapter.

The old camera-diversity repair, Creative concept selection, visibility pruning,
ANIMA shotPlan hierarchy, and terminal-state schema must not steer new prompts.
Some old files remain for historical record/evaluation compatibility. Test-only
legacy helpers are isolated under `src/testing/`, not exported by the production
backend entry point.

## Source controls

| Source control | Extension setting | Meaning |
| --- | --- | --- |
| `Card.Mode` | `moduleMode` | Illustration, Asset, or Comic schema/assembly |
| `Card.Nsfw` | `nsfwInstructions` | Instruction-strength and separate explicit-scene field; **not** a safe-content filter |
| `Card.Supplement` | `supplement` | Source natural-language supplements |
| `Card.Prompt.Compatibility` | `promptSyntax` | NAI or ComfyUI prompt weight syntax |
| `Card.PromptSep` | `promptSeparator` | Pipe, newline, or source native character-channel path |
| `Card.Text` | `imageTextLanguage` | Disabled, freeform, English, Korean, Japanese, or Chinese |
| `Card.PanelNum` | `comicMinPanels` | Minimum panels requested per comic shot |
| `Card.Userchat` | `includeUserMessage` | Preceding user message context, separate from persona information |
| `Card.CharAppearance.Depth` | `characterContextDepth` | Context recency, not deletion of saved character records |
| `Card.Quote` | `quoteEnabled` | Source quote field; does not add a new chat caption renderer |
| `Card.Encode` | `encodingMode` | Plain, placeholder, Base64, or Atbash source protocols |
| `Card.Prefill` | `prefillEnabled` | Source prefill messages |
| `Card.CustomPos` | `customPositivePrefix` | Positive preset prefix |
| `Card.CustomNeg` | `customPositiveSuffix` | Positive preset suffix, despite the source name |

`customNegative` remains the extension's explicit negative-prompt addition.
The selected `promptPresets` entry maps its positive and negative fields to the
source `[Positive]` and `[Negative]` templates. Positive templates support
`{prompt}`, `{setup}`, and `{char}`. Source `{supplement}` is an empty legacy
placeholder; enabled natural-language supplements already join character tags.
With no selected preset, the preserved `preset1.txt` is used. `CustomPos` is
prepended before preset output, and `CustomNeg` is appended afterward.

Encoding/prefill controls are part of the requested port. Their presence does
not guarantee that a selected parser provider accepts prefill or encoded output.
The initial source system message stays plaintext in every encoding mode.

## Host adapters and saved memory

Persona, character, and activated lorebook data come from Spindle RPCs rather
than Risu's synchronous functions. Enabled lorebook content is not filtered by
the retired ANIMA visual-keyword rules. Preprocessing and main parsing share the
selected parser connection; separate source main/auxiliary LLM selection is not
available in this adapter.

Memory depth and character negatives live in `state.v376CharacterMemory`.
`state.characterAppearance` keeps plain tags for the existing memory editor.
Depth zero removes detailed tags from parser context, not from saved storage.
Manual entries are protected against automatic replacement. Manual rename and
delete synchronize both storage forms. Manual input keeps reference names and
user-entered clothing/pose tags; it no longer uses ANIMA's tag-pruning rules.

## Verification boundaries

- Deterministic source parity checks must compare field conditioning, prompt
  order, weights, separators, preset substitution, character negatives, context
  ordering, and protocol handling. Passing old ANIMA tests is not evidence of
  source parity or better image quality.
- NovelAI character prompts can be preserved in `parameters.characters` at the
  Spindle request boundary. The installed host types accept arbitrary parameter
  objects but do not document whether the NAI driver consumes this field.
  End-to-end native character handling remains unverified. No host repository
  files are changed by this port.
- Literal source inconsistencies (for example, a schema marking `sex` required
  while semantic instructions permit omission) and malformed JSON examples must
  be documented rather than silently replaced with new artistic policies.
- Old sidecar/image-study artifacts use the retired ANIMA pipeline and rubric.
  They remain historical evidence, not a live comparison of the new engine.

## Status

Implementation and parity verification are in progress. This document is not a
claim of completed end-to-end provider validation.
