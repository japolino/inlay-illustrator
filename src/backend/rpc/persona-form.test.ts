import { expect, test } from "bun:test";
import { createEmptyChatData } from "../../shared/contract/index.js";
import { CHAT_ID, PERSONA_ID } from "../pipeline/testing/fixtures.js";
import { personaFormFixture } from "../pipeline/testing/persona-form-fixture.js";
import { personaFormHandlers } from "./handlers/persona-form.js";
import type { RpcContext } from "./types.js";

function setup(profile?: string) {
  const fx = personaFormFixture(profile);
  const ctx = { ...fx.services, modules: {} } as RpcContext;
  const get = (chatId = CHAT_ID) => personaFormHandlers["personaForm.get"]!({ chatId }, ctx);
  const set = (formId: string | null, personaId = PERSONA_ID, chatId = CHAT_ID) => personaFormHandlers["personaForm.set"]!({ chatId, personaId, formId }, ctx);
  return { fx, ctx, get, set };
}
test("manual choice persists in only this chat, survives reload, and leaves global defaults/history alone", async () => {
  const { fx, get, set } = setup();
  const before = await fx.services.storage.loadChatData(CHAT_ID);
  const config = structuredClone(fx.config.value);
  const initial = await get();
  expect(initial.selectedFormId).toBeNull();
  expect(initial.forms.map((f) => f.id)).toEqual(["form_default", "form_wolf"]);
  expect((await set("form_wolf")).selectedFormId).toBe("form_wolf");
  expect((await get()).selectedFormId).toBe("form_wolf");
  const after = await fx.services.storage.loadChatData(CHAT_ID);
  expect(after.history).toEqual(before.history);
  expect(after.store).toEqual(before.store);
  expect(after.actorState).toEqual(before.actorState);
  expect(fx.config.value).toEqual(config);
  fx.chats.push({ ...fx.chats[0]!, chatId: "chat-2" });
  expect((await get("chat-2")).selectedFormId).toBeNull();
  expect(fx.events.at(-1)).toEqual({ event: "chatData.changed", payload: { chatId: CHAT_ID, messageKeys: [] } });
});
test("Auto removes only this persona's override", async () => {
  const { fx, set } = setup();
  fx.chatData.set(CHAT_ID, { ...createEmptyChatData(CHAT_ID), personaFormSelections: { [PERSONA_ID]: "form_wolf", other: "dragon" } });
  expect((await set(null)).selectedFormId).toBeNull();
  expect(fx.chatData.get(CHAT_ID)!.personaFormSelections).toEqual({ other: "dragon" });
});
test("clearing the last selection restores the original optional document shape", async () => {
  const { fx, set } = setup(); await set("form_wolf"); await set(null);
  expect(Object.hasOwn(fx.chatData.get(CHAT_ID)!, "personaFormSelections")).toBe(false);
});
test("selection follows the chat's bound persona rather than the workspace editor", async () => {
  const { fx, get, set } = setup();
  fx.services.sources.getActivePersona = async (chatId) => fx.personas.find((p) => p.personaId === fx.chats.find((c) => c.chatId === chatId)?.personaId) ?? null;
  await set("form_wolf");
  fx.personas.push({ ...fx.personas[0]!, personaId: "other", name: "Other" });
  fx.chats[0]!.personaId = "other";
  expect((await get()).selectedFormId).toBeNull();
  await expect(set("form_wolf")).rejects.toThrow(/persona changed/);
  fx.chats[0]!.personaId = PERSONA_ID;
  expect((await get()).selectedFormId).toBe("form_wolf");
});
test("removed forms are visibly reported, cannot be saved, and can be cleared", async () => {
  const { fx, get, set } = setup();
  fx.chatData.set(CHAT_ID, { ...createEmptyChatData(CHAT_ID), personaFormSelections: { [PERSONA_ID]: "deleted" } });
  expect(await get()).toMatchObject({ selectedFormId: "deleted", missingForm: true });
  await expect(set("deleted")).rejects.toThrow(/no longer exists/);
  expect((await set(null)).missingForm).toBe(false);
});
for (const formId of ["", "   ", 3, undefined, {}, false]) {
  test(`invalid form selection is rejected before writing: ${JSON.stringify(formId)}`, async () => {
    const { fx, set } = setup();
    await expect(set(formId as never)).rejects.toThrow(/formId/);
    expect(fx.chatData.size).toBe(0);
  });
}
test("missing chats and missing personas cannot acquire selections", async () => {
  const { fx, get, set } = setup();
  await expect(get("missing")).rejects.toThrow(/Chat not found/);
  await expect(set("form_wolf", PERSONA_ID, "missing")).rejects.toThrow(/Chat not found/);
  fx.activePersonaId.value = null;
  expect((await get()).personaId).toBeNull();
  await expect(set("form_wolf")).rejects.toThrow(/persona changed/);
  expect(fx.chatData.size).toBe(0);
});
test("V4.5 does not claim support, and switching back to Auto remains possible", async () => {
  const { fx, get, set } = setup("v4-5");
  expect((await get()).supported).toBe(false);
  await expect(set("form_wolf")).rejects.toThrow(/V5/);
  fx.chatData.set(CHAT_ID, { ...createEmptyChatData(CHAT_ID), personaFormSelections: { [PERSONA_ID]: "form_wolf" } });
  expect((await set(null)).selectedFormId).toBeNull();
});
test("webtoon mode does not claim support", async () => {
  const { fx, get, set } = setup();
  const original = fx.services.storage.loadChatImageGenerationSettings;
  fx.services.storage.loadChatImageGenerationSettings = async () => ({ ...await original(), webtoonMode: true });
  expect((await get()).supported).toBe(false);
  await expect(set("form_wolf")).rejects.toThrow(/V5/);
});
