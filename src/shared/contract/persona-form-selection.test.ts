import { expect, test } from "bun:test";
import { createEmptyChatData, normalizeChatData, validateChatData } from "./chat.js";

test("old chat documents retain their exact shape and are not marked repaired", () => {
  const doc = createEmptyChatData("chat", "2026-10-24T12:00:00Z");
  expect(normalizeChatData(doc, "chat")).toEqual({ data: doc, issues: [], repaired: false });
  expect(validateChatData(doc, "chat")).toEqual({ ok: true, data: doc });
});
test("per-persona form selections survive validation and storage normalization", () => {
  const doc = { ...createEmptyChatData("chat"), personaFormSelections: { p1: "wolf", p2: "form_default" } };
  expect(normalizeChatData(doc, "chat").data).toEqual(doc);
  expect(validateChatData(doc, "chat")).toEqual({ ok: true, data: doc });
});
for (const invalid of [null, [], "wolf", 42, { p1: null }, { p1: "" }, { "": "wolf" }, { p1: " wolf " }]) {
  test(`invalid selections are repaired without losing history or actor state: ${JSON.stringify(invalid)}`, () => {
    const original = createEmptyChatData("chat");
    original.actorState.revision = 7;
    const input = { ...original, personaFormSelections: invalid };
    expect(validateChatData(input, "chat").ok).toBe(false);
    const result = normalizeChatData(input, "chat");
    expect(result.repaired).toBe(true);
    expect(result.data).toEqual(original);
    expect(result.issues.every((i) => i.part === "document")).toBe(true);
  });
}
test("one corrupt entry does not discard another persona's selection", () => {
  const doc = { ...createEmptyChatData("chat"), personaFormSelections: { good: "wolf", bad: 4 } };
  expect(normalizeChatData(doc, "chat").data.personaFormSelections).toEqual({ good: "wolf" });
});
test("ids matching object prototype keys round-trip as own data properties", () => {
  const doc = { ...createEmptyChatData("chat"), personaFormSelections: JSON.parse('{"__proto__":"wolf","constructor":"form_default"}') };
  expect(JSON.stringify(normalizeChatData(doc, "chat").data.personaFormSelections)).toBe(JSON.stringify(doc.personaFormSelections));
});
