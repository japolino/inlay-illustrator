# engine/text — paragraph slots, native markup detection, lenient JSON

Typed facade over the verbatim Asset Maid 0.9.88 core (`../core/asset-maid-core.ts`). No algorithm is re-implemented.

## Module map
| file | content |
|---|---|
| `slots.ts` | paragraph slots + native asset markup / image token detection + AM markup stripping |
| `json.ts` | lenient JSON parser for LLM replies and its error class |
| `index.ts` | re-exports |

## API (original name @ pretty line)
- `illustrationSlotId(messageKey, index)` — `hSt` @157540 → `${messageKey}:slot:${index}`.
- `splitParagraphSlots(messageKey, text, {paragraphText?})` — `X0e` @157581 → `{paragraphs, insertionOffsets, slots}`.
- `splitParagraphSlotsWithoutMarkups(messageKey, text, markups)` — `rIe` @171433.
- `buildIllustrationSlots({messageKey, content, nativeAssetDetectors})` — `nIe` @171443 (fH → H2 → rIe; `noSlotsDiagnostics`).
  Zero slots = the caller shows "Could not find a paragraph position to insert images. Check the message body." (`V1t`).
- `stripAssetMaidMarkup(text, {generatedAssetNames?, isGeneratedAssetName?})` — `fH` @121051.
- `detectNativeAssetMarkups(text, {customImageTokenDetectors?})` — `H2` @121254.
- `detectImageTokens(text, {customImageTokenDetectors?})` — `tb` @121186.
- `isGeneratedAssetName(name)` — `HE` @29213 (`<label>.__am__.<chat|outfit>.<uuid>`).
- `buildCharxAssetRegexDetectors({character, analysisMap, characterIds})` — `sH` @120727.
- `parseLenientJson(raw)` — `iQe` @79678; `isLenientJsonParseError(e)`; `AnalyzerClientErrorClass` (`on` @79248).

## Inputs read
- `buildIllustrationSlots`: message content (the AI reply incl. any baked AM HTML) and the detectors.
- `buildCharxAssetRegexDetectors`: `config.characterPrompt.charxAssetRegexAnalysis` (= `analysisMap`), the character card
  fields `chaId`, `id`, `name`, `type`, `customscript[] {in, flag, comment|name}`. In Lumiverse the "card" is the character;
  customscripts come from the imported Risu card extensions (mapping is backend work).

## Behaviour notes (verified by fixtures)
- `<Thoughts>` blocks are never split, but they are NOT removed from paragraph text: a Thoughts block forms its own paragraph.
  Callers that hide Thoughts must strip them before slotting. An unclosed `<Thoughts>` is ignored (normal split).
- Paragraphs that only hold native image tokens disappear (token removed, empty paragraph dropped).
- Native tokens inside backtick code spans and `~~~` fences are not detected (and stay in the paragraph text).
- `data:` URIs are not native tokens.
- `parseLenientJson` coerces non-string/non-number input to "" (→ error); for several valid blocks it returns the LAST one.

## Parity coverage
`bun test src/engine/text` — fixtures from `scratch/engine/text/gen.mjs` (original bundle):
19 texts × detector sets (none / charx / named-group + non-global) × {split, strip(HE), strip(names), H2, tb, nIe};
slot id edge cases; 26 lenient JSON inputs incl. error shape.

## Gaps
- `buildCharxAssetRegexDetectors` has no fixture (thin pass-through).
