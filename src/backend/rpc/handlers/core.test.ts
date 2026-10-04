import { describe, expect, test } from "bun:test";
import { createEmptyCharacterDocument, formCollectionRevision, isRpcEvent, type RpcMethod, type RpcParams, type RpcResult } from "../../../shared/contract/index.js";
import { createServices } from "../../services/index.js";
import { answerFetchBridge, createFakeHost } from "../../testing/fake-host.js";
import type { RpcContext } from "../types.js";
import { coreHandlers } from "./core.js";

function setup() {
  const fake = createFakeHost();
  const services = createServices(fake.host, fake.userId);
  fake.host.onFrontendMessage((payload) => void services.imageBytes.acceptFrontendMessage(payload as Record<string, unknown>));
  const ctx: RpcContext = { ...services, modules: {} as RpcContext["modules"] };
  const call = async <M extends RpcMethod>(method: M, params: RpcParams<M>): Promise<RpcResult<M>> => {
    const handler = coreHandlers[method] as ((p: RpcParams<M>, c: RpcContext) => Promise<RpcResult<M>> | RpcResult<M>) | undefined;
    if (!handler) throw new Error(`no handler ${method}`);
    return handler(params, ctx);
  };
  const events = () => fake.sent.map((s) => s.payload).filter(isRpcEvent);
  return { fake, services, call, events };
}

describe("core handlers: session, config, connections", () => {
  test("hello / status: protocol check, active chat, missing permissions", async () => {
    const { fake, call } = setup();
    fake.addCharacter({ id: "c1" });
    fake.addChat({ id: "chat1", character_id: "c1", metadata: { group: true, character_ids: ["c1", "c2"] } });
    fake.activeChatId = "chat1";
    fake.granted.delete("image_gen");
    const hello = await call("session.hello", { protocol: 1, clientId: "x", surface: "overlay" });
    expect(hello.status).toMatchObject({ ready: true, extensionVersion: "0.10.0", activeChatId: "chat1", activeCharacterId: "c1", activeGroupCharacterIds: ["c1", "c2"], missingPermissions: ["image_gen"] });
    await expect(call("session.hello", { protocol: 2, clientId: "x", surface: "overlay" })).rejects.toMatchObject({ error: { code: "protocol-mismatch" } });
  });

  test("config.get / update (deep merge + normalize + event) / factory reset", async () => {
    const { fake, call, events } = setup();
    fake.imageConnections.push({ id: "comfy", name: "Comfy", provider: "comfyui", api_url: "", model: "", is_default: false, has_api_key: false, default_parameters: {}, metadata: {}, created_at: 0, updated_at: 0 });
    const got = await call("config.get", {});
    expect(got.config.analysis.timeoutMs).toBe(180000);
    expect(got.chatImageGeneration).toBeTruthy();
    const { config } = await call("config.update", { patch: { analysis: { temperature: 5 }, image: { connectionId: "comfy" } } });
    expect(config.analysis.temperature).toBe(2);
    expect(config.analysis.timeoutMs).toBe(180000);
    expect(config.image.provider).toBe("comfyui");
    expect(config.runtime.generationProvider).toBe("comfy-ui");
    expect(events().map((e) => e.event)).toEqual(["config.changed", "status.changed"]);
    const reset = await call("config.update", { patch: { analysis: { temperature: null } } as never });
    expect(reset.config.analysis.temperature).toBe(0.2);
    await expect(call("config.factoryReset", { confirm: false as unknown as true })).rejects.toMatchObject({ error: { code: "bad-request" } });
    await call("config.factoryReset", { confirm: true });
    expect((await call("config.get", {})).config.analysis.temperature).toBe(0.2);
  });

  test("chat image settings, ui state, connections, logs", async () => {
    const { fake, call, services } = setup();
    const settings = (await call("config.get", {})).chatImageGeneration;
    const saved = await call("chatImageGeneration.set", { settings: { ...settings, autoGenerationEnabled: true } });
    expect(saved.settings.autoGenerationEnabled).toBe(true);
    const ui = (await call("config.get", {})).uiState;
    await call("uiState.set", { uiState: { ...ui, global: { ...ui.global, navigationLayout: "list" } } });
    expect((await call("config.get", {})).uiState.global.navigationLayout).toBe("list");
    fake.llmConnections.push({ id: "l1", name: "L", provider: "openai", api_url: "", model: "m", preset_id: null, is_default: true, has_api_key: true, metadata: {}, reasoning_bindings: null, created_at: 0, updated_at: 0 });
    expect((await call("connections.listLlm", {})).connections).toEqual([{ id: "l1", name: "L", provider: "openai", model: "m", isDefault: true, hasApiKey: true }]);
    answerFetchBridge(fake, { "/api/v1/connections/l1/models": { json: { models: ["m", "m2"], model_labels: { m2: "Model 2" } } } });
    expect((await call("connections.listLlmModels", { connectionId: "l1" })).models).toEqual([{ id: "m", label: "m" }, { id: "m2", label: "Model 2" }]);
    fake.scriptLlm({ content: "Hi" });
    expect(await call("analyzer.testMessage", {})).toMatchObject({ ok: true, reply: "Hi" });
    fake.llmConnections.push({ id: "l2", name: "L2", provider: "anthropic", api_url: "", model: "c", preset_id: null, is_default: false, has_api_key: true, metadata: {}, reasoning_bindings: null, created_at: 0, updated_at: 0 });
    fake.scriptLlm({ content: "Draft" });
    expect(await call("analyzer.testMessage", { text: "yo", analysis: { connectionId: "l2", model: "c-draft", reasoning: { mode: "off" } } })).toMatchObject({ ok: true, reply: "Draft" });
    expect(fake.generateCalls.at(-1)!.input).toMatchObject({ connection_id: "l2", model: "c-draft", reasoning: { source: "off" } });
    expect((await call("config.get", {})).config.analysis.connectionId).toBe("");
    services.log.append("info", "x", "line");
    expect((await call("logs.list", {})).entries.map((e) => e.message)).toContain("line");
    await call("logs.clear", {});
    expect((await call("logs.list", {})).entries).toEqual([]);
  });
});

describe("core handlers: host drawer", () => {
  test("session.closeHostDrawer calls spindle.ui.closeDrawer for the user; a missing API is a no-op", async () => {
    const { fake, call } = setup();
    const host = fake.host as unknown as { ui?: Record<string, unknown> };
    const calls: unknown[] = [];
    const saved = host.ui;
    host.ui = { ...(saved ?? {}), closeDrawer: async (options: unknown) => { calls.push(options); } };
    expect(await call("session.closeHostDrawer", {})).toEqual({ ok: true });
    expect(calls).toEqual([{ userId: fake.userId }]);
    host.ui = {};
    expect(await call("session.closeHostDrawer", {})).toEqual({ ok: true });
    host.ui = saved;
  });
});

describe("core handlers: charx settings, reset, artists, personas", () => {
  test("override goes to the document, defaults to the config, dirty fields tracked; clear restores", async () => {
    const { call, services } = setup();
    const before = await call("charxSettings.get", { characterId: "c1" });
    expect(before.dirtyFields).toEqual([]);
    const set = await call("charxSettings.setOverride", { characterId: "c1", patch: { nsfwAlwaysEnabled: !before.effective.nsfwAlwaysEnabled } });
    expect(set.effective.nsfwAlwaysEnabled).toBe(!before.effective.nsfwAlwaysEnabled);
    expect(set.dirtyFields).toEqual(["nsfwAlwaysEnabled"]);
    const doc = await services.storage.loadCharacterDocument("c1");
    expect(doc.characterPrompt.charxSettings.overrides.c1?.nsfwAlwaysEnabled).toBe(!before.effective.nsfwAlwaysEnabled);
    const all = await call("charxSettings.setDefaults", { patch: { negativePrompt: "lowres" } });
    expect(all.all.negativePrompt).toBe("lowres");
    expect((await services.storage.loadConfig()).novelai.negativePrompt).toBe("lowres");
    const got = await call("charxSettings.get", { characterId: "c1" });
    expect(got.effective.negativePrompt).toBe("lowres");
    const cleared = await call("charxSettings.clearOverrides", { characterId: "c1" });
    expect(cleared.effective.nsfwAlwaysEnabled).toBe(before.effective.nsfwAlwaysEnabled);
    expect((await call("charxSettings.get", { characterId: "c1" })).dirtyFields).toEqual([]);
    const none = await call("charxSettings.get", { characterId: "" });
    expect(none.dirtyFields).toEqual([]);
    expect(none.all).toBeDefined();
  });

  test("charxSettings.resetAll bumps the default revisions so overrides lose", async () => {
    const { call, events } = setup();
    const before = await call("charxSettings.get", { characterId: "c1" });
    await call("charxSettings.setOverride", { characterId: "c1", patch: { stateAccumulationEnabled: !before.effective.stateAccumulationEnabled } });
    const { all } = await call("charxSettings.resetAll", {});
    expect(all.stateAccumulationEnabled).toBe(before.all.stateAccumulationEnabled);
    const after = await call("charxSettings.get", { characterId: "c1" });
    expect(after.effective.stateAccumulationEnabled).toBe(before.effective.stateAccumulationEnabled);
    expect(after.dirtyFields).toEqual([]);
    expect(events().at(-1)?.event).toBe("config.changed");
  });

  test("character.reset deletes the document and dirty bookkeeping", async () => {
    const { call, services } = setup();
    await call("charxSettings.setOverride", { characterId: "c1", patch: { stateAccumulationEnabled: false } });
    expect(await services.storage.hasCharacterDocument("c1")).toBe(true);
    await call("character.reset", { characterId: "c1", confirm: true });
    expect(await services.storage.hasCharacterDocument("c1")).toBe(false);
    expect((await call("charxSettings.get", { characterId: "c1" })).dirtyFields).toEqual([]);
  });

  test("artists: list, upsert/delete NovelAI (preset overrides only), Anima, per-character + global selection", async () => {
    const { call, services } = setup();
    const list = await call("artists.list", { characterId: "c1" });
    expect(list.selectedNovelAIId).toBe("detail_anime_illustration_style");
    expect(list.selectedAnimaId).toBe("none");
    const { entry } = await call("artists.upsertNovelAI", { entry: { id: "", title: "Mine", prompt: "artist:me" } });
    expect(entry.id).toMatch(/^artist_/);
    const preset = list.novelai.find((a) => !a.userDefined && a.id !== "none")!;
    await call("artists.upsertNovelAI", { entry: { id: preset.id, title: "ignored", prompt: "ignored", novelAIOverrides: { steps: 20 } } });
    const after = await call("artists.list", {});
    expect(after.novelai.find((a) => a.id === preset.id)).toMatchObject({ prompt: preset.prompt, novelAIOverrides: { steps: 20 } });
    expect(after.novelai.find((a) => a.id === entry.id)).toMatchObject({ title: "Mine", userDefined: true });
    await call("artists.select", { list: "novelai", artistId: entry.id, characterId: "c1" });
    expect((await call("artists.list", { characterId: "c1" })).selectedNovelAIId).toBe(entry.id);
    await expect(call("artists.select", { list: "novelai", artistId: "nope", characterId: "c1" })).rejects.toMatchObject({ error: { code: "not-found" } });
    await call("artists.deleteNovelAI", { id: entry.id });
    expect((await call("artists.list", { characterId: "c1" })).selectedNovelAIId).toBe("detail_anime_illustration_style");

    const anima = await call("artists.upsertAnima", { entry: { id: "", title: "A", text: "@artist" } });
    await call("artists.select", { list: "anima", artistId: anima.entry.id });
    expect((await services.storage.loadConfig()).animaArtists.selection.defaultId).toBe(anima.entry.id);
    await call("artists.select", { list: "anima", artistId: "none", characterId: "c1" });
    expect((await call("artists.list", { characterId: "c1" })).selectedAnimaId).toBe("none");
    expect((await call("artists.list", {})).selectedAnimaId).toBe(anima.entry.id);
    await call("artists.deleteAnima", { id: anima.entry.id });
    expect((await services.storage.loadConfig()).animaArtists.selection.defaultId).toBe("none");
  });

  test("personas: list with forms, saveForms with base revision guard, settings", async () => {
    const { fake, call, services } = setup();
    fake.addPersona({ id: "p1", name: "Me", image_id: "img9", is_default: true });
    const { personas } = await call("personas.list", {});
    expect(personas[0]).toMatchObject({ personaId: "p1", name: "Me", avatarUrl: "/api/v1/images/img9?size=sm", isActive: true, profile: null });
    const base = formCollectionRevision(personas[0]!.forms);
    const edited = { ...personas[0]!.forms, forms: personas[0]!.forms.forms.map((f) => ({ ...f, label: "Edited" })) };
    const saved = await call("personas.saveForms", { personaId: "p1", collection: edited, baseRevision: base });
    expect(saved.collection.forms[0]!.label).toBe("Edited");
    expect(saved.revision).toBe(formCollectionRevision(saved.collection));
    await expect(call("personas.saveForms", { personaId: "p1", collection: edited, baseRevision: base })).rejects.toMatchObject({ error: { code: "conflict" } });
    await call("personas.setSettings", { personaGender: "female", malePersonaPrompt: "x", selectedPersonaKey: "p1" });
    const cp = (await services.storage.loadConfig()).characterPrompt;
    expect([cp.personaGender, cp.malePersonaPrompt, cp.personaSettings.selectedPersonaKey]).toEqual(["female", "x", "p1"]);
    expect(createEmptyCharacterDocument("x").characterId).toBe("x");
  });

  test("workspace.listCharacters", async () => {
    const { fake, call } = setup();
    fake.addCharacter({ id: "c1", name: "Alice" });
    expect((await call("workspace.listCharacters", {})).characters.map((c) => c.name)).toEqual(["Alice"]);
  });
});
