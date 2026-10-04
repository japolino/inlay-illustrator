import { describe, expect, test } from "bun:test";
import { CHAT_ACTION_RPC, CHAT_ACTIONS, ILLUSTRATION_ATTR, imageIdFromResultUrl, imageResultUrl, pagerStep, readIllustrationAttributes, renderIllustrationBlock } from "./chat-dom.js";
import { isRpcMethod } from "./rpc.js";

const input = {
  chatId: "chat-1",
  messageId: "m-1",
  swipeId: 2,
  messageKey: "illustration:m-1@2",
  revisionId: "rev-1",
  slotId: "illustration:m-1@2:slot:0",
  slotIndex: 0,
  entryId: "e\"1",
  assetName: "Alice.__am__.chat.0b9d3f7e-1d2c-4c5b-9a8e-1234567890ab",
  imageId: "0b9d3f7e-1d2c-4c5b-9a8e-1234567890ab",
  width: 832,
  height: 1216,
  entryIndex: 1,
  entryCount: 3,
  canRegenerate: true,
  imageIndex: 0,
};

function attributesOf(html: string): Map<string, string> {
  const div = /<div\b([^>]*)>/u.exec(html)![1]!;
  const map = new Map<string, string>();
  for (const m of div.matchAll(/([a-z-]+)(?:="([^"]*)")?/gu)) map.set(m[1]!, (m[2] ?? "").replace(/&quot;/gu, '"').replace(/&amp;/gu, "&"));
  return map;
}

describe("chat DOM contract", () => {
  test("baked block round-trips through readIllustrationAttributes", () => {
    const html = renderIllustrationBlock(input);
    expect(html.startsWith("<!-- inlay_illustrator -->\n<div ")).toBe(true);
    expect(html.match(/<div\b/gu)!.length).toBe(1);
    const attrs = attributesOf(html);
    const parsed = readIllustrationAttributes((name) => attrs.get(name) ?? null)!;
    expect(parsed).toMatchObject({ chatId: "chat-1", messageId: "m-1", swipeId: 2, slotIndex: 0, entryId: 'e"1', entryIndex: 1, entryCount: 3, canRegenerate: true, imageId: input.imageId });
    expect(html).toContain(`src="${imageResultUrl(input.imageId)}"`);
    expect(attrs.get(ILLUSTRATION_ATTR.block)).toBe("true");
  });
  test("non-blocks are ignored", () => {
    expect(readIllustrationAttributes(() => null)).toBeNull();
  });
  test("image result url", () => {
    expect(imageIdFromResultUrl("http://x/api/v1/image-gen/results/abc%20d?size=sm")).toBe("abc d");
    expect(imageIdFromResultUrl("/images/1")).toBeNull();
  });
  test("pager wraps like Asset Maid", () => {
    expect(pagerStep(0, 3, "previous")).toBe(2);
    expect(pagerStep(2, 3, "next")).toBe(0);
    expect(pagerStep(0, 0, "next")).toBe(-1);
  });
  test("every action maps to real RPC methods", () => {
    for (const action of CHAT_ACTIONS) for (const method of CHAT_ACTION_RPC[action]) expect(isRpcMethod(method)).toBe(true);
    expect(isRpcMethod("chatDom.getMessageStates")).toBe(true);
  });
});
