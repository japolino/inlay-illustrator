import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { GeneratedRecord, State } from "./types.js";
import { findLatestGeneratedTurn, storeGeneratedRecord, updateState } from "./storage.js";
import { rerunAllStoredImages } from "./generation.js";
import { tryAcquireRuntimeLock } from "./runtime-lock.js";

class MemoryUserStorage {
  readonly files = new Map<string, string>();
  readonly writeCalls: Array<{ path: string; userId?: string; data: string }> = [];
  private key(path: string, userId?: string): string {
    return JSON.stringify([userId ?? null, path]);
  }
  seedState(chatId: string, userId: string | undefined, state: State): void {
    this.files.set(this.key(`states/${chatId}.json`, userId), JSON.stringify(state));
  }
  storedState(chatId: string, userId?: string): State {
    const contents = this.files.get(this.key(`states/${chatId}.json`, userId));
    if (contents === undefined) throw new Error(`No state stored for ${userId || "default"}/${chatId}.`);
    return JSON.parse(contents) as State;
  }
  async exists(path: string, userId?: string): Promise<boolean> {
    return this.files.has(this.key(path, userId));
  }
  async read(path: string, userId?: string): Promise<string> {
    const contents = this.files.get(this.key(path, userId));
    if (contents === undefined) throw new Error(`missing ${path}`);
    return contents;
  }
  async write(path: string, data: string, userId?: string): Promise<void> {
    this.writeCalls.push({ path, userId, data });
    this.files.set(this.key(path, userId), data);
  }
  async mkdir(): Promise<void> {}
}

let storage: MemoryUserStorage;
const chatUpdates: Array<{ chatId: string; messageId: string }> = [];
const generated: Array<{ prompt: string; index: number }> = [];

function makeRecord(overrides: Partial<GeneratedRecord> = {}): GeneratedRecord {
  const base: GeneratedRecord = {
    chatId: "chat-1",
    messageId: "msg-1",
    swipeId: 0,
    prompts: ["finalPrompt1", "finalPrompt2"],
    negativePrompts: ["neg1", "neg2"],
    quotes: ["quote1", "quote2"],
    imageParameters: [{ width: 512 }, { width: 512 }],
    corePrompts: ["core1", "core2"],
    shotNegatives: ["shotNeg1", "shotNeg2"],
    promptFormats: ["ordered", "ordered"],
    paragraphs: [1, 2],
    imageIds: ["id1", "id2"],
    imageUrls: ["/api/v1/image-gen/results/id1", "/api/v1/image-gen/results/id2"],
    rawJson: { scenes: [] },
    createdAt: new Date().toISOString(),
    rawPromptData: [
      { setup: "setup1", charPos: "pos1", charNeg: "neg1", supplement: "sup1", situation: "sit1", place: "place1", camera: "cam1", action: "act1" },
      { setup: "setup2", charPos: "pos2", charNeg: "neg2", supplement: "sup2", situation: "sit2", place: "place2", camera: "cam2", action: "act2" }
    ]
  };
  return { ...base, ...overrides } as GeneratedRecord;
}

async function seedRecord(record: GeneratedRecord, userId = "user-1"): Promise<string> {
  const key = `${record.chatId}:${record.messageId}:${record.swipeId ?? 0}`;
  await storeGeneratedRecord(record.chatId, key, record, userId);
  await updateState(record.chatId, userId, (state) => {
    state.generated[key] = record;
  });
  return key;
}

beforeEach(() => {
  storage = new MemoryUserStorage();
  chatUpdates.length = 0;
  generated.length = 0;
  storage.seedState("chat-1", "user-1", { characterAppearance: {}, generated: {} });
  (globalThis as typeof globalThis & { spindle: unknown }).spindle = {
    userStorage: {
      exists: (path: string, userId?: string) => storage.exists(path, userId),
      read: (path: string, userId?: string) => storage.read(path, userId),
      write: (path: string, data: string, userId?: string) => storage.write(path, data, userId),
      mkdir: () => storage.mkdir()
    },
    imageGen: {
      listConnections: async () => [{ id: "conn-1", provider: "nai", is_default: true, default_parameters: {} }],
      generate: async (request: { prompt: string }) => {
        const index = generated.length;
        generated.push({ prompt: request.prompt, index });
        if (index === 1) throw new Error("second image fails");
        return { imageId: `new-id-${index}`, imageUrl: `/api/v1/image-gen/results/new-id-${index}` };
      }
    },
    chat: {
      getMessages: async () => [{ id: "msg-1", content: "text with inlay" }],
      updateMessage: async (chatId: string, messageId: string) => { chatUpdates.push({ chatId, messageId }); }
    },
    log: { info: () => {}, warn: () => {}, error: () => {} },
    sendToFrontend: () => {}
  };
});

afterEach(() => {
  delete (globalThis as typeof globalThis & { spindle?: unknown }).spindle;
});

describe("findLatestGeneratedTurn (floating action button latest-turn resolution)", () => {
  test("returns null for a chat with no generated records", async () => {
    expect(await findLatestGeneratedTurn("chat-1", "user-1")).toBeNull();
  });

  test("prefers the newest record across messages and swipes", async () => {
    const older = makeRecord({ messageId: "msg-1", swipeId: 0, createdAt: "2024-01-01T00:00:00.000Z" });
    const newer = makeRecord({ messageId: "msg-2", swipeId: 3, createdAt: "2024-06-01T00:00:00.000Z" });
    await seedRecord(older);
    await seedRecord(newer);
    expect(await findLatestGeneratedTurn("chat-1", "user-1")).toEqual({ messageId: "msg-2", swipeId: 3 });
  });

  test("invalid timestamps fall back to a stable key tie-break", async () => {
    const first = makeRecord({ messageId: "msg-1", swipeId: 0, createdAt: "" });
    const second = makeRecord({ messageId: "msg-2", swipeId: 0, createdAt: "" });
    await seedRecord(first);
    await seedRecord(second);
    expect(await findLatestGeneratedTurn("chat-1", "user-1")).toEqual({ messageId: "msg-2", swipeId: 0 });
  });
});

describe("rerunAllStoredImages (FAB full-reroll semantics)", () => {
  test("reroll keeps stored prompts frozen and preserves the failed peer image", async () => {
    await seedRecord(makeRecord());
    const result = await rerunAllStoredImages("chat-1", "msg-1", 0, "user-1");
    expect(result.failedCount).toBe(1);
    expect(result.record.imageIds[0]).toBe("new-id-0");
    expect(result.record.imageIds[1]).toBe("id2");
    expect(result.record.imageUrls[1]).toBe("/api/v1/image-gen/results/id2");
    // Prompts are recomposed from the stored raw prompt data (frozen
    // snapshot), not from current settings; both dispatches happen in order.
    expect(generated.length).toBe(2);
    expect(generated[0].prompt).not.toBe("");
    expect(generated[1].prompt).not.toBe(generated[0].prompt);
  });

  test("sidecar rerun takes a separate lock from the plain full reroll", async () => {
    await seedRecord(makeRecord());
    const lockKey = JSON.stringify(["user-1", "chat-1", "msg-1", 0, "full-sidecar"]);
    const release = tryAcquireRuntimeLock("image-action", lockKey);
    expect(release).toBeFunction();
    await expect(rerunAllStoredImages("chat-1", "msg-1", 0, "user-1", undefined, true))
      .rejects.toThrow("Sidecar rerun is already running");
    release?.();
  });
});
