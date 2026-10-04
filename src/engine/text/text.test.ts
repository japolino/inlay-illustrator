// Fixtures: bun C:/Users/eme4/asset-maid-port/scratch/engine/text/gen.mjs  (runs the ORIGINAL bundle)
import { describe, expect, test } from "bun:test";
import { toPlain } from "../testing/plain";
import slotsFx from "../__fixtures__/text/slots.json";
import jsonFx from "../__fixtures__/text/lenient-json.json";
import {
  buildIllustrationSlots,
  detectImageTokens,
  detectNativeAssetMarkups,
  illustrationSlotId,
  isGeneratedAssetName,
  isLenientJsonParseError,
  parseLenientJson,
  splitParagraphSlots,
  stripAssetMaidMarkup,
  type NativeAssetDetector,
} from "./index";

function capture(fn: () => unknown): unknown {
  try {
    return { ok: toPlain(fn()) };
  } catch (e) {
    const err = e as { name?: string; message?: string; code?: string; analyzerRaw?: string };
    return { error: { name: err?.name, message: err?.message, code: err?.code, ...(err && "analyzerRaw" in err ? { analyzerRaw: err.analyzerRaw } : {}) } };
  }
}
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));

interface SlotCase {
  input: { name: string; messageKey: string; content: string; detectors: { scriptName: string; source: string; flags: string }[] };
  expected: Record<string, unknown>;
}

describe("text/slots parity", () => {
  for (const c of (slotsFx as { cases: SlotCase[] }).cases) {
    test(c.input.name, () => {
      const mk = (): NativeAssetDetector[] => c.input.detectors.map((d) => ({ scriptName: d.scriptName, regex: new RegExp(d.source, d.flags) }));
      const text = c.input.content;
      const actual = {
        split: capture(() => splitParagraphSlots(c.input.messageKey, text)),
        strip: capture(() => stripAssetMaidMarkup(text, { isGeneratedAssetName })),
        stripNames: capture(() => stripAssetMaidMarkup(text, { generatedAssetNames: [slotsFx.generatedAssetName, "alice_smile"] })),
        native: capture(() => detectNativeAssetMarkups(text, { customImageTokenDetectors: mk() })),
        tokens: capture(() => detectImageTokens(text, { customImageTokenDetectors: mk() })),
        slots: capture(() => buildIllustrationSlots({ messageKey: c.input.messageKey, content: text, nativeAssetDetectors: mk() })),
      };
      expect(plain(actual)).toEqual(c.expected);
    });
  }
  test("illustrationSlotId", () => {
    for (const c of slotsFx.slotIds) {
      expect(plain(capture(() => illustrationSlotId(c.input[0], c.input[1] as number)))).toEqual(c.expected);
    }
  });
});

describe("text/lenient JSON parity", () => {
  for (const [i, c] of (jsonFx.cases as { input: unknown; expected: unknown }[]).entries()) {
    test(`case ${i}: ${JSON.stringify(c.input)?.slice(0, 40)}`, () => {
      expect(plain(capture(() => parseLenientJson(c.input)))).toEqual(c.expected);
    });
  }
  test("error type guard", () => {
    try {
      parseLenientJson("nothing");
      throw new Error("expected throw");
    } catch (e) {
      expect(isLenientJsonParseError(e)).toBe(true);
    }
  });
});
