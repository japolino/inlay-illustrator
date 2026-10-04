import { describe, expect, test } from "bun:test";
import { renderIllustrationBlock, SUPPRESSION_ID_ATTR } from "../../shared/contract/index.js";
import {
  bakeMessage,
  cleanMessageContent,
  decodeSuppressionCarriers,
  encodeSuppressionCarrier,
  messageSlots,
  stripForInterceptor,
  suppressionCarrierId,
  suppressNativeMarkups,
} from "./markup.js";

const KEY = "illustration:m1@0";
const block = (slotIndex: number, imageId = `img-${slotIndex}`) =>
  renderIllustrationBlock({
    chatId: "c1",
    messageId: "m1",
    swipeId: 0,
    messageKey: KEY,
    revisionId: "revision:a",
    slotId: `${KEY}:slot:${slotIndex}`,
    slotIndex,
    entryId: `generated:x.__am__.chat.${slotIndex}`,
    assetName: `x.__am__.chat.${slotIndex}`,
    imageId,
    entryIndex: 1,
    entryCount: 1,
    canRegenerate: true,
    imageIndex: 0,
  });

describe("suppression carriers", () => {
  test("id format and round trip (AM zbe / Vyt / cH)", () => {
    const markup = "{{img::alice smile}}";
    expect(suppressionCarrierId(markup)).toMatch(/^NAS1[0-9A-F]{8}[0-9A-Z]+$/);
    const carrier = encodeSuppressionCarrier(markup);
    expect(carrier).toContain(`${SUPPRESSION_ID_ATTR}="${suppressionCarrierId(markup)}"`);
    expect(decodeSuppressionCarriers(`a ${carrier} b`)).toBe(`a ${markup} b`);
  });
  test("invalid carrier decodes to empty", () => {
    const carrier = encodeSuppressionCarrier("{{img::a}}").replace("NAS1", "NAS2");
    expect(decodeSuppressionCarriers(`x${carrier}y`)).toBe("xy");
  });
  test("Asset Maid carrier format is decoded too", () => {
    const markup = "{{img::a}}";
    const am = `<span class="am-native-asset-suppression" data-am-native-asset-suppression="${suppressionCarrierId(markup)}" data-am-native-asset-suppression-payload="${encodeURIComponent(markup)}" aria-hidden="true" hidden></span>`;
    expect(decodeSuppressionCarriers(am)).toBe(markup);
  });
  test("suppressNativeMarkups wraps at verified offsets", () => {
    const text = "Hi {{img::a}} there";
    const out = suppressNativeMarkups(text, [{ sourceMarkup: "{{img::a}}", sourceOffset: 3, detectorName: "" }, { sourceMarkup: "{{img::b}}", sourceOffset: 0, detectorName: "" }]);
    expect(out).toBe(`Hi ${encodeSuppressionCarrier("{{img::a}}")} there`);
  });
});

describe("bake", () => {
  const text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
  test("blocks go after the separator of their gap, idempotent, strip restores the text", () => {
    const once = bakeMessage({ content: text, messageKey: KEY, blocks: [{ slotIndex: 0, html: block(0) }, { slotIndex: 1, html: block(1) }], suppressNative: false });
    expect(once.changed).toBe(true);
    expect(once.text.startsWith("First paragraph.\n\n<!-- inlay_illustrator -->")).toBe(true);
    expect(once.text.indexOf(block(0))).toBeLessThan(once.text.indexOf("Second paragraph."));
    expect(once.text.indexOf(block(1))).toBeGreaterThan(once.text.indexOf("Second paragraph."));
    expect(once.text.indexOf(block(1))).toBeLessThan(once.text.indexOf("Third paragraph."));
    const twice = bakeMessage({ content: once.text, messageKey: KEY, blocks: [{ slotIndex: 0, html: block(0) }, { slotIndex: 1, html: block(1) }], suppressNative: false });
    expect(twice.text).toBe(once.text);
    expect(twice.changed).toBe(false);
    expect(cleanMessageContent(once.text)).toBe(text);
  });
  test("re-bake with another selection replaces the old block", () => {
    const once = bakeMessage({ content: text, messageKey: KEY, blocks: [{ slotIndex: 0, html: block(0, "a") }], suppressNative: false }).text;
    const next = bakeMessage({ content: once, messageKey: KEY, blocks: [{ slotIndex: 1, html: block(1, "b") }], suppressNative: false }).text;
    expect(next).not.toContain('data-inlay-illustrator-image-id="a"');
    expect(next).toContain('data-inlay-illustrator-image-id="b"');
    expect(cleanMessageContent(next)).toBe(text);
  });
  test("CRLF texts keep CRLF separators", () => {
    const crlf = "One.\r\n\r\nTwo.";
    const out = bakeMessage({ content: crlf, messageKey: KEY, blocks: [{ slotIndex: 0, html: block(0) }], suppressNative: false }).text;
    expect(out).toBe(`One.\r\n\r\n${block(0)}\r\n\r\nTwo.`);
    expect(cleanMessageContent(out)).toBe(crlf);
  });
  test("native markups are suppressed and decoded back; slots ignore token-only paragraphs", () => {
    const withToken = "Alice smiles.\n\n{{img::alice}}\n\nBob waves.";
    const slots = messageSlots(KEY, withToken);
    expect(slots.slots.length).toBe(1);
    const out = bakeMessage({ content: withToken, messageKey: KEY, blocks: [{ slotIndex: 0, html: block(0) }], suppressNative: true }).text;
    expect(out).not.toContain("{{img::alice}}");
    expect(out).toContain(encodeSuppressionCarrier("{{img::alice}}"));
    expect(cleanMessageContent(out)).toBe(withToken);
    expect(bakeMessage({ content: out, messageKey: KEY, blocks: [{ slotIndex: 0, html: block(0) }], suppressNative: true }).text).toBe(out);
  });
  test("missing slot indices are appended at the end", () => {
    const out = bakeMessage({ content: "One.\n\nTwo.", messageKey: KEY, blocks: [{ slotIndex: 5, html: block(5) }], suppressNative: false });
    expect(out.orphanSlotIndices).toEqual([5]);
    expect(out.text.endsWith(block(5))).toBe(true);
  });
  test("empty selection returns the clean text", () => {
    const once = bakeMessage({ content: text, messageKey: KEY, blocks: [{ slotIndex: 0, html: block(0) }], suppressNative: false }).text;
    expect(bakeMessage({ content: once, messageKey: KEY, blocks: [], suppressNative: false }).text).toBe(text);
  });
});

describe("stripForInterceptor", () => {
  test("strips blocks and decodes carriers, keeps identity of untouched messages", () => {
    const baked = bakeMessage({ content: "A {{img::x}}.\n\nB.", messageKey: KEY, blocks: [{ slotIndex: 0, html: block(0) }], suppressNative: true }).text;
    const user = { role: "user", content: "hello" };
    const out = stripForInterceptor([user, { role: "assistant", content: baked }, { role: "assistant", content: [{ type: "text", text: baked }] }]);
    expect(out[0]).toBe(user);
    expect(out[1]!.content).toBe("A {{img::x}}.\n\nB.");
    expect((out[2]!.content as Array<{ text: string }>)[0]!.text).toBe("A {{img::x}}.\n\nB.");
  });
});
