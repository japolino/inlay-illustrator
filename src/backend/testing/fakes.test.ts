import { describe, expect, test } from "bun:test";
import { answerFetchBridge, createFakeHost } from "./fake-host.js";
import { createFakeServices } from "./fake-services.js";

describe("fake host", () => {
  test("userStorage round trip, list relative to prefix, recursive delete", async () => {
    const fake = createFakeHost();
    await fake.host.userStorage.write("config/a.json", "{}");
    await fake.host.userStorage.write("config/sub/b.json", "{}");
    expect((await fake.host.userStorage.list("config/")).sort()).toEqual(["a.json", "sub/b.json"]);
    await fake.host.userStorage.delete("config/");
    expect(fake.files.size).toBe(0);
    await expect(fake.host.userStorage.read("missing.json")).rejects.toThrow("File not found");
  });

  test("scripted LLM replies, image generation and event emit", async () => {
    const fake = createFakeHost();
    fake.scriptLlm({ content: "a" }, new Error("boom"));
    expect(await fake.host.generate.raw({ type: "raw" })).toEqual({ content: "a" });
    await expect(fake.host.generate.raw({ type: "raw" })).rejects.toThrow("boom");
    fake.imageConnections.push({ id: "nai", name: "NAI", provider: "novelai", api_url: "", model: "nai-diffusion-4-5-full", is_default: true, has_api_key: true, default_parameters: {}, metadata: {}, created_at: 0, updated_at: 0 });
    const result = await fake.host.imageGen.generate({ prompt: "x", includeDataUrl: false });
    expect(result.imageId).toBeTruthy();
    expect(fake.images.has(result.imageId!)).toBe(true);
    let seen: unknown = null;
    fake.host.on("CHAT_CHANGED", (p) => { seen = p; });
    await fake.emit("CHAT_CHANGED", { chatId: "c" });
    expect(seen).toEqual({ chatId: "c" });
  });

  test("fetch bridge auto answer", async () => {
    const fake = createFakeHost();
    const got: unknown[] = [];
    fake.host.onFrontendMessage((p) => got.push(p));
    answerFetchBridge(fake, { "/api/x": { json: [1] } });
    fake.host.sendToFrontend({ type: "inlay-illustrator:fetch-request", requestId: "r1", url: "/api/x", as: "json" });
    await Promise.resolve();
    expect(got).toEqual([{ type: "inlay-illustrator:fetch-response", requestId: "r1", json: [1] }]);
  });
});

describe("fake services", () => {
  test("llm replies, document revision guard, events", async () => {
    const fx = createFakeServices();
    fx.llmReplies.push({ ok: 1 }, '```json\n{"a":2}\n```');
    expect((await fx.services.llm.complete({ purpose: "t", messages: [], responseMode: "json" })).parsed).toEqual({ ok: 1 });
    const client = fx.services.llm.analyzerClient();
    expect((await client.complete({}, [])).parsed).toEqual({ a: 2 });
    const doc = await fx.services.storage.updateCharacterDocument("c1", (d) => ({ ...d, animaArtistId: "x" }));
    expect(doc.animaArtistId).toBe("x");
    await expect(fx.services.storage.updateCharacterDocument("c1", (d) => d, { expectedUpdatedAt: "old" })).rejects.toMatchObject({ error: { code: "conflict" } });
    expect(fx.events.map((e) => e.event)).toEqual(["document.changed"]);
  });
});
