/**
 * Paragraph slots for the illustration workflow (spec/pipeline.md §1.6-§1.7).
 *
 * Thin typed facade over the verbatim Asset Maid core. Nothing is re-implemented here:
 * every function delegates to the original minified function (name + pretty line in the JSDoc).
 */
import {
  buildIllustrationSlots as coreBuildIllustrationSlots,
  detectNativeAssetMarkups as coreDetectNativeAssetMarkups,
  illustrationSlotId as coreIllustrationSlotId,
  splitParagraphSlots as coreSplitParagraphSlots,
  stripAssetMaidMarkup as coreStripAssetMaidMarkup,
  buildCharxAssetRegexDetectors as coreBuildCharxAssetRegexDetectors,
  HE as isGeneratedAssetNameCore,
  tb as detectImageTokensCore,
  rIe as splitParagraphSlotsWithoutMarkupsCore,
} from "../core/asset-maid-core";

/** A charx / manual regex detector (`{scriptName, regex}`, built by `sH` @120727). */
export interface NativeAssetDetector {
  scriptName: string;
  regex: RegExp;
}

/** One gap between two consecutive non-empty paragraphs. */
export interface IllustrationSlot {
  /** `${messageKey}:slot:${index}` (`hSt`). */
  slotId: string;
  /** `slot:${slotId}`. */
  sourceImageToken: string;
  /** 0-based gap index. */
  index: number;
  /** Paragraph `index` (whitespace collapsed). */
  beforeText: string;
  /** Paragraph `index + 1` (whitespace collapsed). */
  afterText: string;
}

export interface ParagraphSlotSplit {
  /** Non-empty paragraphs, whitespace collapsed to single spaces. */
  paragraphs: string[];
  /** Offsets in the input text right after each kept separator (all paragraphs but the last). */
  insertionOffsets: number[];
  slots: IllustrationSlot[];
}

export interface SplitParagraphSlotsOptions {
  /** Maps the raw paragraph text before whitespace collapsing (default: identity). */
  paragraphText?: (text: string) => string;
}

/** Diagnostics attached by `buildIllustrationSlots` when no slot was found. */
export interface NoSlotsDiagnostics {
  unfilteredSlotCount: number;
  filteredSlotCount: number;
  assetMatchCount: number;
  nativeAssetDetectorNames: string[];
}

export interface IllustrationSlotBuild extends ParagraphSlotSplit {
  noSlotsDiagnostics?: NoSlotsDiagnostics;
}

/** Native asset markup found in a message (`H2` output). */
export interface NativeAssetMarkup {
  sourceMarkup: string;
  sourceOffset: number;
  /** Detector names joined with " | " ("" for built-in token forms). */
  detectorName: string;
}

export type ImageTokenMarkupType =
  | "risu_image"
  | "risu_asset"
  | "risu_img"
  | "am_generated_html"
  | "html_img_src"
  | "html_img_equals"
  | "charx_regex";

/** Chat image token occurrence (`tb` output, spec/pipeline.md §1.6). */
export interface ImageTokenOccurrence {
  full: string;
  tokenName: string;
  characterName: string;
  markupType: ImageTokenMarkupType;
  offset: number;
  end: number;
  index: number;
  before: string;
  after: string;
  detectorName?: string;
}

export interface StripAssetMaidMarkupOptions {
  /** Explicit generated asset names whose tokens / `{{raw::NAME}}` uses are removed. */
  generatedAssetNames?: string[];
  /** Predicate for generated asset names (Asset Maid passes `HE`, see {@link isGeneratedAssetName}). */
  isGeneratedAssetName?: (name: string) => boolean;
}

/**
 * Slot id for gap `index` of a message.
 * Original: `hSt` @157540. Throws `TypeError("Illustration slot requires a messageKey.")` on an empty key.
 * The index is rounded and clamped to >= 0.
 */
export function illustrationSlotId(messageKey: unknown, index: number): string {
  return coreIllustrationSlotId(messageKey, index);
}

/**
 * Split a message into paragraphs on blank lines (`/\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*\/gu`), never inside a
 * `<Thoughts>…</Thoughts>` block, collapse whitespace, drop empty paragraphs and build one slot per gap.
 * Original: `X0e` @157581-157604. A text with < 2 paragraphs has no slots.
 */
export function splitParagraphSlots(
  messageKey: string,
  text: string | null | undefined,
  options: SplitParagraphSlotsOptions = {},
): ParagraphSlotSplit {
  return coreSplitParagraphSlots(messageKey, text, options);
}

/**
 * `splitParagraphSlots` where the paragraph text has native-suppression spans (`Wyt`) and every given markup string
 * removed (longest first). Original: `rIe` @171433.
 */
export function splitParagraphSlotsWithoutMarkups(messageKey: string, text: string, markups: string[]): ParagraphSlotSplit {
  return splitParagraphSlotsWithoutMarkupsCore(messageKey, text, markups);
}

/**
 * Full paragraph-slot build used by the illustration workflow (spec/pipeline.md §1.7):
 * 1. `stripAssetMaidMarkup(content, {isGeneratedAssetName: HE})`; 2. `detectNativeAssetMarkups`;
 * 3. `splitParagraphSlotsWithoutMarkups`. When no slot exists, `noSlotsDiagnostics` is set.
 * Original: `nIe` @171443.
 */
export function buildIllustrationSlots(input: {
  messageKey: string;
  content: string;
  nativeAssetDetectors: NativeAssetDetector[];
}): IllustrationSlotBuild {
  return coreBuildIllustrationSlots(input) as IllustrationSlotBuild;
}

/**
 * Remove Asset Maid's own display HTML (`am-illustration-projection` / `am-image` / `am-generated-image` blocks, `wC`)
 * and generated-asset tokens / `{{raw::NAME}}` references (`nbt`), eating one following blank line when the
 * markup stood alone on its line. `<Thoughts>` blocks are left alone. Original: `fH` @121051.
 */
export function stripAssetMaidMarkup(text: string, options: StripAssetMaidMarkupOptions = {}): string {
  return coreStripAssetMaidMarkup(text, options);
}

/**
 * Merged list of native asset markups: custom detector matches + built-in token forms (`tb`), excluding AM blocks,
 * code spans / `~~~` fences and `<Thoughts>` blocks; overlapping ranges are merged (detector names joined " | ").
 * Original: `H2` @121254-121294.
 */
export function detectNativeAssetMarkups(
  text: string,
  options: { customImageTokenDetectors?: NativeAssetDetector[] } = {},
): NativeAssetMarkup[] {
  return coreDetectNativeAssetMarkups(text, options);
}

/**
 * Ordered chat image token occurrences (`{{img::x}}`, `{{image::x}}`, `{{asset::x}}`, `<img src=..>`, `<img=..>`,
 * charx regex detectors). AM generated HTML is skipped. Original: `tb` @121186-121253.
 */
export function detectImageTokens(
  text: string,
  options: { customImageTokenDetectors?: NativeAssetDetector[] } = {},
): ImageTokenOccurrence[] {
  return detectImageTokensCore(text, options) as ImageTokenOccurrence[];
}

/**
 * True for Asset Maid generated asset names (`<label>.__am__.<chat|outfit>.<uuid>`). Original: `HE` @29213.
 */
export function isGeneratedAssetName(name: unknown): boolean {
  return isGeneratedAssetNameCore(name);
}

/**
 * Build the charx regex detectors from `config.characterPrompt.charxAssetRegexAnalysis`
 * (status "done" or manual detectors; script detectors need the matching customscript on the card).
 * Original: `sH` @120727. Input shape: `{character?, analysisMap, characterIds?}` (Risu character card fields
 * `chaId`/`id`/`name`/`type`/`customscript`).
 */
export function buildCharxAssetRegexDetectors(input: {
  character?: Record<string, unknown> | null;
  analysisMap?: Record<string, unknown> | null;
  characterIds?: string[];
}): NativeAssetDetector[] {
  return coreBuildCharxAssetRegexDetectors(input);
}
