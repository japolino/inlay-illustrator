import { describe, expect, test } from "bun:test";
import { normalizeConfig, STORAGE_PATHS } from "../../shared/contract/index.js";
import { createFakeHost } from "../testing/fake-host.js";
import { createRunLog } from "./run-log.js";
import { createStorageService } from "./storage.js";
import type { EventBus } from "./types.js";

function setup() {
  const fake = createFakeHost();
  const emitted: Array<{ event: string; payload: any }> = [];
  const events: EventBus = { emit: (event, payload) => void emitted.push({ event, payload }) };
  const log = createRunLog();
  let t = Date.parse("2026-01-01T00:00:00.000Z");
  const storage = createStorageService(fake.host, fake.userId, { events, log, now: () => new Date(t) });
  return { fake, storage, emitted, log, tick: (ms = 1000) => (t += ms) };
}

describe("storage service: raw JSON", () => {
  test("missing -> fallback, corrupt -> storage-error, list is root relative", async () => {
    const { fake, storage } = setup();
    expect(await storage.readJson("x/y.json", { a: 1 })).toEqual({ a: 1 });
    fake.files.set("x/bad.json", "{oops");
    await expect(storage.readJson("x/bad.json", null)).rejects.toMatchObject({ error: { code: "storage-error", detailCode: "STORAGE_CORRUPT_JSON" } });
    await storage.writeJson("x/y.json", { b: 2 });
    expect(await storage.readJson("x/y.json", null)).toEqual({ b: 2 });
    expect((await storage.list("x/")).sort()).toEqual(["x/bad.json", "x/y.json"]);
    expect(JSON.parse(fake.files.get("storage-schema.json") as string)).toMatchObject({ schema: "inlay-illustrator.storage", version: 1 });
  });

  test("updateJson is FIFO per path", async () => {
    const { storage } = setup();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        storage.updateJson<number[]>("q.json", [], async (list) => {
          await new Promise((r) => setTimeout(r, Math.random() * 3));
          return [...list, i];
        }),
      ),
    );
    expect(results.at(-1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test("binary read of a missing path is null; delete of a missing path is fine", async () => {
    const { storage } = setup();
    expect(await storage.readBinary("nope.png")).toBeNull();
    await storage.delete("nope.png");
    await storage.writeBinary("uploads/a.png", new Uint8Array([1, 2]));
    expect(Array.from((await storage.readBinary("uploads/a.png"))!)).toEqual([1, 2]);
  });
});

describe("storage service: config", () => {
  test("defaults when empty; update writes only changed split files as diffs and emits config.changed", async () => {
    const { fake, storage, emitted } = setup();
    const config = await storage.loadConfig();
    expect(config.analysis.timeoutMs).toBe(180000);
    await storage.updateConfig((c) => ({ ...c, analysis: { ...c.analysis, temperature: 0.7 } }));
    const model = JSON.parse(fake.files.get(STORAGE_PATHS.configModel) as string);
    expect(model).toEqual({ analysis: { temperature: 0.7 }, version: 1 });
    expect(emitted.map((e) => e.event)).toEqual(["config.changed"]);
    const writes = fake.storageOps.filter((o) => o.op === "write").map((o) => o.path);
    // second update with an unchanged settings part does not rewrite it
    const before = writes.length;
    await storage.updateConfig((c) => ({ ...c, analysis: { ...c.analysis, temperature: 0.8 } }));
    const after = fake.storageOps.filter((o) => o.op === "write").map((o) => o.path).slice(before);
    expect(after).toEqual([STORAGE_PATHS.configModel]);
    const fresh = createStorageService(fake.host, fake.userId);
    expect((await fresh.loadConfig()).analysis.temperature).toBe(0.8);
  });

  test("a config file from a newer build is not overwritten", async () => {
    const { fake, storage } = setup();
    fake.files.set(STORAGE_PATHS.configModel, JSON.stringify({ version: 99, analysis: { temperature: 1.5 } }));
    expect((await storage.loadConfig()).analysis.temperature).toBe(1.5);
    await expect(storage.updateConfig((c) => ({ ...c, analysis: { ...c.analysis, temperature: 0.1 } }))).rejects.toMatchObject({ error: { code: "storage-error", detailCode: "STORAGE_FILE_TOO_NEW" } });
    expect(JSON.parse(fake.files.get(STORAGE_PATHS.configModel) as string).version).toBe(99);
  });

  test("chat image settings: save normalizes + emits; ui state round trip", async () => {
    const { storage, emitted } = setup();
    const def = await storage.loadChatImageGenerationSettings();
    const saved = await storage.saveChatImageGenerationSettings({ ...def, autoGenerationEnabled: !def.autoGenerationEnabled });
    expect(saved.settings.autoGenerationEnabled).toBe(!def.autoGenerationEnabled);
    expect((await storage.loadChatImageGenerationSettings()).autoGenerationEnabled).toBe(!def.autoGenerationEnabled);
    expect(emitted.at(-1)?.event).toBe("chatImageGeneration.changed");
    const ui = await storage.loadUiState();
    await storage.saveUiState({ ...ui, global: { ...ui.global, splitRatio: 0.6 } });
    expect((await storage.loadUiState()).global.splitRatio).toBe(0.6);
  });
});

describe("storage service: documents", () => {
  test("character document: empty when missing, revision guard, monotonic updatedAt, document.changed", async () => {
    const { storage, emitted } = setup();
    expect(await storage.hasCharacterDocument("c1")).toBe(false);
    const empty = await storage.loadCharacterDocument("c1");
    expect(empty.characterId).toBe("c1");
    const a = await storage.updateCharacterDocument("c1", (d) => ({ ...d, animaArtistId: "x" }), { reason: "artists" });
    const b = await storage.updateCharacterDocument("c1", (d) => d, { expectedUpdatedAt: a.updatedAt });
    expect(b.updatedAt > a.updatedAt).toBe(true);
    await expect(storage.updateCharacterDocument("c1", (d) => d, { expectedUpdatedAt: a.updatedAt })).rejects.toMatchObject({ error: { code: "conflict", detailCode: "ASSET_MAID_CHARX_EXTERNAL_CHANGE" } });
    expect(emitted.filter((e) => e.event === "document.changed").map((e) => e.payload.reason)).toEqual(["artists", "update"]);
    expect(await storage.hasCharacterDocument("c1")).toBe(true);
    expect((await storage.loadCharacterDocument("c1")).animaArtistId).toBe("x");
  });

  test("concurrent document updates are serialized", async () => {
    const { storage } = setup();
    await Promise.all(["a", "b", "c"].map((id) => storage.updateCharacterDocument("c1", (d) => ({ ...d, characterPrompt: { ...d.characterPrompt, selectedCharacters: [...d.characterPrompt.selectedCharacters, id] } }))));
    expect((await storage.loadCharacterDocument("c1")).characterPrompt.selectedCharacters).toEqual(["a", "b", "c"]);
  });

  test("chat data: lenient load, update sets updatedAt", async () => {
    const { fake, storage } = setup();
    fake.files.set(STORAGE_PATHS.chatData("chat1"), JSON.stringify({ schema: "other" }));
    const loaded = await storage.loadChatData("chat1");
    expect(loaded.chatId).toBe("chat1");
    const updated = await storage.updateChatData("chat1", (d) => d);
    expect(updated.schema).toBe("inlay-illustrator.chat-data");
    expect(JSON.parse(fake.files.get(STORAGE_PATHS.chatData("chat1")) as string).chatId).toBe("chat1");
  });

  test("factory reset and character reset", async () => {
    const { fake, storage } = setup();
    await storage.updateConfig((c) => ({ ...c, enabled: !c.enabled }));
    await storage.updateCharacterDocument("c1", (d) => d);
    await storage.updateCharacterDocument("c2", (d) => d);
    fake.files.set("characters/c1/reference-crops/a.png", "x");
    await storage.updateChatData("chat1", (d) => d);
    await storage.resetCharacter("c1");
    expect([...fake.files.keys()].some((k) => k.startsWith("characters/c1/"))).toBe(false);
    expect(fake.files.has(STORAGE_PATHS.characterDocument("c2"))).toBe(true);
    expect(fake.files.has(STORAGE_PATHS.chatData("chat1"))).toBe(true);
    fake.files.set("unrelated.txt", "keep");
    await storage.factoryReset();
    expect([...fake.files.keys()]).toEqual(["unrelated.txt"]);
    expect((await storage.loadConfig()).enabled).toBe(normalizeConfig({}).enabled);
  });
});
