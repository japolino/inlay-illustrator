import { describe, expect, test } from "bun:test";
import { createEmptyCharacterDocument, formCollectionRevision, isRpcEvent, STORAGE_PATHS, type RpcMethod, type RpcParams, type RpcResult } from "../../../shared/contract/index.js";
import { createServices } from "../../services/index.js";
import { createFakeHost } from "../../testing/fake-host.js";
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
    fake.llmModels.l1 = [{ id: "m", label: "m" }, { id: "m2", label: "Model 2" }];
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
    await call("charxSettings.setOverride", { characterId: "c1", patch: { nsfwAlwaysEnabled: !before.effective.nsfwAlwaysEnabled } });
    const { all } = await call("charxSettings.resetAll", {});
    expect(all.nsfwAlwaysEnabled).toBe(before.all.nsfwAlwaysEnabled);
    const after = await call("charxSettings.get", { characterId: "c1" });
    expect(after.effective.nsfwAlwaysEnabled).toBe(before.effective.nsfwAlwaysEnabled);
    expect(after.dirtyFields).toEqual([]);
    expect(events().at(-1)?.event).toBe("config.changed");
  });

  test("character.reset deletes the document and dirty bookkeeping", async () => {
    const { call, services } = setup();
    await call("charxSettings.setOverride", { characterId: "c1", patch: { nsfwAlwaysEnabled: false } });
    expect(await services.storage.hasCharacterDocument("c1")).toBe(true);
    await call("character.reset", { characterId: "c1", confirm: true });
    expect(await services.storage.hasCharacterDocument("c1")).toBe(false);
    expect((await call("charxSettings.get", { characterId: "c1" })).dirtyFields).toEqual([]);
  });

  test("artists: list, upsert/delete NovelAI, Anima, per-character + global selection", async () => {
    const { call, services } = setup();
    const list = await call("artists.list", { characterId: "c1" });
    // AM 0.9.90: "none" is the only built-in and the default.
    expect(list.selectedNovelAIId).toBe("none");
    expect(list.novelai.map((a) => a.id)).toEqual(["none"]);
    expect(list.selectedAnimaId).toBe("none");
    const { entry } = await call("artists.upsertNovelAI", { entry: { id: "", title: "Mine", prompt: "artist:me" } });
    expect(entry.id).toMatch(/^artist_/);
    await expect(call("artists.upsertNovelAI", { entry: { id: "none", title: "x", prompt: "x" } })).rejects.toMatchObject({ error: { code: "bad-request" } });
    await call("artists.upsertNovelAI", { entry: { ...entry, novelAIOverrides: { steps: 20, sampler: "k_dpmpp_2m_sde", noiseSchedule: "exponential" } } });
    const after = await call("artists.list", {});
    expect(after.novelai.find((a) => a.id === entry.id)).toMatchObject({ title: "Mine", userDefined: true, novelAIOverrides: { steps: 20, sampler: "k_dpmpp_2m_sde", noiseSchedule: "exponential" } });
    await call("artists.select", { list: "novelai", artistId: entry.id, characterId: "c1" });
    expect((await call("artists.list", { characterId: "c1" })).selectedNovelAIId).toBe(entry.id);
    await expect(call("artists.select", { list: "novelai", artistId: "nope", characterId: "c1" })).rejects.toMatchObject({ error: { code: "not-found" } });
    await call("artists.deleteNovelAI", { id: entry.id });
    expect((await call("artists.list", { characterId: "c1" })).selectedNovelAIId).toBe("none");

    const anima = await call("artists.upsertAnima", { entry: { id: "", title: "A", text: "@artist" } });
    await call("artists.select", { list: "anima", artistId: anima.entry.id });
    expect((await services.storage.loadConfig()).animaArtists.selection.defaultId).toBe(anima.entry.id);
    await call("artists.select", { list: "anima", artistId: "none", characterId: "c1" });
    expect((await call("artists.list", { characterId: "c1" })).selectedAnimaId).toBe("none");
    expect((await call("artists.list", {})).selectedAnimaId).toBe(anima.entry.id);
    await call("artists.deleteAnima", { id: anima.entry.id });
    expect((await services.storage.loadConfig()).animaArtists.selection.defaultId).toBe("none");
  });

  test("artists: global NovelAI preset, followed by characters without an own artist", async () => {
    const { fake, call, services } = setup();
    // v1 documents stored the built-in default even when nobody picked it: those follow the global preset.
    const legacy = { ...createEmptyCharacterDocument("old"), version: 1 };
    fake.files.set(STORAGE_PATHS.characterDocument("old"), JSON.stringify({ ...legacy, characterPrompt: { ...legacy.characterPrompt, selectedArtistId: "detail_anime_illustration_style" } }));
    expect(await call("artists.list", { characterId: "c1" })).toMatchObject({ selectedNovelAIId: "none", globalNovelAIId: "none", followsGlobalNovelAI: true });

    const { entry } = await call("artists.upsertNovelAI", { entry: { id: "", title: "Mine", prompt: "artist:me" } });
    const other = (await call("artists.upsertNovelAI", { entry: { id: "", title: "Other", prompt: "artist:other" } })).entry;
    await call("artists.select", { list: "novelai", artistId: entry.id });
    expect(JSON.parse(fake.files.get(STORAGE_PATHS.artistsGlobal) as string).characterPrompt.defaultArtistId).toBe(entry.id);
    for (const id of ["c1", "old"]) expect(await call("artists.list", { characterId: id })).toMatchObject({ selectedNovelAIId: entry.id, followsGlobalNovelAI: true });

    await call("artists.select", { list: "novelai", artistId: other.id, characterId: "c1" });
    expect(await call("artists.list", { characterId: "c1" })).toMatchObject({ selectedNovelAIId: other.id, globalNovelAIId: entry.id, followsGlobalNovelAI: false });
    await call("artists.select", { list: "novelai", artistId: "", characterId: "old" });
    expect((await services.storage.loadCharacterDocument("old")).characterPrompt.selectedArtistId).toBe("");

    await call("artists.deleteNovelAI", { id: entry.id });
    expect(await call("artists.list", { characterId: "old" })).toMatchObject({ selectedNovelAIId: "none", globalNovelAIId: "none" });
    expect((await call("artists.list", { characterId: "c1" })).selectedNovelAIId).toBe(other.id);
  });

  test("artists: default style star (AM 0.9.90) — none rules, own pick wins, Anima follows the default again", async () => {
    const { call, services } = setup();
    // Default "none": characters without an own style get no artist; an explicit own pick wins over the default.
    await call("artists.select", { list: "novelai", artistId: "none" });
    expect(await call("artists.list", { characterId: "c1" })).toMatchObject({ selectedNovelAIId: "none", globalNovelAIId: "none", followsGlobalNovelAI: true });
    const style = (await call("artists.upsertNovelAI", { entry: { id: "", title: "Comic", prompt: "artist:comic" } })).entry;
    await call("artists.select", { list: "novelai", artistId: style.id });
    await call("artists.select", { list: "novelai", artistId: "none", characterId: "c1" });
    expect(await call("artists.list", { characterId: "c1" })).toMatchObject({ selectedNovelAIId: "none", globalNovelAIId: style.id, followsGlobalNovelAI: false });

    const a = await call("artists.upsertAnima", { entry: { id: "", title: "A", text: "@a" } });
    const b = await call("artists.upsertAnima", { entry: { id: "", title: "B", text: "@b" } });
    await call("artists.select", { list: "anima", artistId: a.entry.id });
    await call("artists.select", { list: "anima", artistId: b.entry.id, characterId: "c1" });
    expect(await call("artists.list", { characterId: "c1" })).toMatchObject({ selectedAnimaId: b.entry.id, globalAnimaId: a.entry.id, followsGlobalAnima: false });
    // "" + characterId clears the own selection: the character follows the default again.
    await call("artists.select", { list: "anima", artistId: "", characterId: "c1" });
    expect((await services.storage.loadCharacterDocument("c1")).animaArtistId).toBeNull();
    expect(await call("artists.list", { characterId: "c1" })).toMatchObject({ selectedAnimaId: a.entry.id, globalAnimaId: a.entry.id, followsGlobalAnima: true });
    // Clicking the active star clears the default to "none".
    await call("artists.select", { list: "anima", artistId: "none" });
    expect(await call("artists.list", { characterId: "c1" })).toMatchObject({ selectedAnimaId: "none", globalAnimaId: "none" });
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

describe("core handlers: resets stop the jobs that write what they delete", () => {
  test("character reset cancels and waits for that character's analysis; factory reset also stops outfit images and the pipeline", async () => {
    const fake = createFakeHost();
    const services = createServices(fake.host, fake.userId);
    const order: string[] = [];
    const analysisJobs = new Map<string, { characterId: string; settle: () => void; done: Promise<void> }>();
    const addJob = (jobId: string, characterId: string) => {
      let settle!: () => void;
      const done = new Promise<void>((r) => (settle = r)).then(() => void order.push(`${jobId} settled`));
      analysisJobs.set(jobId, { characterId, settle, done });
    };
    addJob("a1", "c1");
    addJob("a2", "c2");
    let pipelineRunning = true;
    const modules = {
      analysis: {
        listActive: () => [...analysisJobs].map(([jobId, j]) => ({ jobId, kind: "character-prompts", characterId: j.characterId, status: "running", progress: { label: "" } })),
        cancel: (filter: { jobId?: string }) => {
          order.push(`cancel ${filter.jobId}`);
          const job = analysisJobs.get(filter.jobId!)!;
          setTimeout(() => {
            analysisJobs.delete(filter.jobId!);
            job.settle();
          }, 5);
          return 1;
        },
        wait: (jobId: string) => analysisJobs.get(jobId)?.done ?? Promise.resolve(),
        outfitImages: { cancelAll: async () => void order.push("outfit images cancelled") },
      },
      pipeline: {
        listActive: () => (pipelineRunning ? [{ jobId: "p1", status: "running" }] : []),
        cancel: (params: { jobId?: string }) => {
          order.push(`cancel pipeline ${params.jobId}`);
          setTimeout(() => (pipelineRunning = false), 5);
        },
      },
    };
    const ctx = { ...services, modules } as unknown as RpcContext;
    const resetCharacter = services.storage.resetCharacter;
    services.storage.resetCharacter = async (id) => {
      order.push(`reset ${id}`);
      return resetCharacter(id);
    };
    const factoryReset = services.storage.factoryReset;
    services.storage.factoryReset = async () => {
      order.push("factory reset");
      return factoryReset();
    };
    await coreHandlers["character.reset"]!({ characterId: "c1", confirm: true }, ctx);
    expect(order).toEqual(["cancel a1", "a1 settled", "reset c1"]);
    order.length = 0;
    await coreHandlers["config.factoryReset"]!({ confirm: true }, ctx);
    expect(order.slice(0, 3)).toEqual(["cancel a2", "outfit images cancelled", "cancel pipeline p1"]);
    expect(order.slice(3)).toEqual(["a2 settled", "factory reset"]);
    expect(pipelineRunning).toBe(false);
  });
});
