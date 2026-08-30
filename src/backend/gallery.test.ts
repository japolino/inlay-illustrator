
import { beforeEach, describe, expect, test } from "bun:test";
import type { GeneratedRecord, GeneratedRecordReference } from "./types.js";
import { GALLERY_CHATS_PER_PAGE, listInlayGallery } from "./storage.js";

// Minimal mock for spindle.userStorage

class MemoryStorage {
  files = new Map<string, string>();
  listCalls: Array<{ prefix?: string; userId?: string }> = [];
  readCalls: Array<{ path: string; userId?: string }> = [];
  writeCalls: string[] = [];

  key(path: string, userId?: string): string {
    return JSON.stringify([userId ?? null, path]);
  }

  seedState(chatId: string, userId: string | undefined, state: unknown): void {
    this.files.set(this.key(`states/${chatId}.json`, userId), JSON.stringify(state));
  }

  seedRecord(chatId: string, recordKey: string, record: unknown, userId?: string): void {
    const safe = encodeURIComponent(recordKey).replace(/%/g, "_");
    const safeChat = encodeURIComponent(chatId).replace(/%/g, "_");
    const path = `records/${safeChat}/${safe}.json`;
    this.files.set(this.key(path, userId), JSON.stringify(record));
  }

  seedWorkflow(hash: string, workflow: unknown, userId?: string): void {
    this.files.set(this.key(`workflows/${hash}.json`, userId), JSON.stringify(workflow));
  }

  async list(prefix?: string, userId?: string): Promise<string[]> {
    this.listCalls.push({ prefix, userId });
    const out: string[] = [];
    for (const k of this.files.keys()) {
      const [uid, path] = JSON.parse(k) as [string | null, string];
      if ((uid ?? null) !== (userId ?? null)) continue;
      if (prefix && !path.startsWith(prefix)) continue;
      out.push(path);
    }
    return out;
  }

  async exists(path: string, userId?: string): Promise<boolean> {
    return this.files.has(this.key(path, userId));
  }

  async read(path: string, userId?: string): Promise<string> {
    this.readCalls.push({ path, userId });
    const contents = this.files.get(this.key(path, userId));
    if (contents === undefined) throw new Error(`Missing ${path}`);
    return contents;
  }

  async getJson<T>(path: string, options?: { fallback?: T; userId?: string }): Promise<T> {
    const fallback = options?.fallback as T;
    const userId = options?.userId;
    const key = this.key(path, userId);
    if (!this.files.has(key)) return fallback as T;
    const raw = this.files.get(key)!;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Simulate corrupt JSON: fallback? Original readJson would catch and return fallback
      // For gallery we want skip corrupt, but readJson wrapper catches and returns fallback
      // To simulate corrupt record, we store invalid JSON via raw not parseable and have list fallback.
      // Here we throw to emulate read failure, but listInlayGallery uses readJson which catches.
      // We instead let loadGeneratedRecord handle null.
      // For state file corrupt, we want readJson to fallback.
      throw new Error("corrupt");
    }
  }

  async readJsonDirect(path: string, userId?: string): Promise<unknown> {
    const key = this.key(path, userId);
    if (!this.files.has(key)) return null;
    const raw = this.files.get(key)!;
    return JSON.parse(raw);
  }

  async setJson(path: string, value: unknown, options?: { indent?: number; userId?: string }): Promise<void> {
    this.files.set(this.key(path, options?.userId), JSON.stringify(value));
  }

  async write(path: string, data: string, userId?: string): Promise<void> {
    this.writeCalls.push(path);
    this.files.set(this.key(path, userId), data);
  }

  async mkdir(): Promise<void> {}
}

let storage: MemoryStorage;

function makeRecord(chatId: string, messageId: string, swipeId: number, paragraphs: number[], imageCount = paragraphs.length): GeneratedRecord {
  const prompts = paragraphs.map((p, i) => `prompt-${p}-${i}`);
  const negatives = paragraphs.map((p) => `negative-${p}`);
  const quotes = paragraphs.map((p) => `quote-${p}`);
  const imageUrls = paragraphs.map((_, i) => `/api/v1/image-gen/results/img-${chatId}-${messageId}-${i}`);
  const imageIds = paragraphs.map((_, i) => `img-${chatId}-${messageId}-${i}`);
  return {
    chatId,
    messageId,
    swipeId,
    prompts,
    negativePrompts: negatives,
    quotes,
    paragraphs,
    imageIds,
    imageUrls,
    rawJson: { scenes: [] },
    createdAt: new Date().toISOString()
  };
}

function makeReference(record: GeneratedRecord, path: string): GeneratedRecordReference {
  return {
    storageVersion: 2,
    recordPath: path,
    chatId: record.chatId,
    messageId: record.messageId,
    swipeId: record.swipeId,
    paragraphs: record.paragraphs,
    imageIds: record.imageIds,
    imageUrls: record.imageUrls,
    createdAt: record.createdAt
  };
}

beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as unknown as { spindle: unknown }).spindle = {
    userStorage: {
      list: (prefix?: string, userId?: string) => storage.list(prefix, userId),
      exists: (p: string, userId?: string) => storage.exists(p, userId),
      read: (p: string, userId?: string) => storage.read(p, userId),
      getJson: (p: string, opts?: { fallback?: unknown; userId?: string }) => storage.getJson(p, opts),
      setJson: (p: string, v: unknown, opts?: { indent?: number; userId?: string }) => storage.setJson(p, v, opts),
      write: (p: string, d: string, userId?: string) => storage.write(p, d, userId),
      mkdir: () => storage.mkdir()
    },
    log: { warn: () => {}, error: () => {}, info: () => {} },
    connections: { list: async () => [] },
    sendToFrontend: () => {}
  };
});

describe("inlay gallery backend", () => {
  test("0 chats returns empty with totalPages 1", async () => {
    const result = await listInlayGallery("user-1", 1);
    expect(result.totalChats).toBe(0);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
    expect(result.chatIds).toEqual([]);
    expect(result.chats).toEqual([]);
    expect(storage.listCalls[0].prefix).toBe("states/");
  });

  test("1 chat groups and orders images by paragraph", async () => {
    // Create state with one chat, record with out-of-order paragraphs 3,1,2
    const chatId = "1";
    const record = makeRecord(chatId, "msg-1", 0, [3, 1, 2]);
    // store as reference to test hydration false
    const recordPath = `records/${chatId}/key1.json`;
    storage.seedRecord(chatId, "key1", { ...record, imageParameters: [{ workflow: { nodes: [1] } }] });
    const ref: GeneratedRecordReference = makeReference(record, recordPath);
    storage.seedState(chatId, "user-1", { characterAppearance: {}, generated: { key1: ref } });
    // Also seed record file (without hydrating workflow)
    // Need actual file at recordPath
    storage.files.set(JSON.stringify(["user-1", recordPath]), JSON.stringify({ ...record, imageParameters: [{ workflow: { __inlayIllustratorWorkflowRef: "hash123" } }] }));
    // Seed workflow file but should NOT be read if no hydration
    storage.seedWorkflow("hash123", { nodes: [1] }, "user-1");

    const result = await listInlayGallery("user-1", 1);
    expect(result.totalChats).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.chatIds).toEqual(["1"]);
    expect(result.chats.length).toBe(1);
    expect(result.chats[0].chatId).toBe("1");
    // images ordered by paragraph 1,2,3
    const paras = result.chats[0].images.map((i) => i.paragraph);
    expect(paras).toEqual([1, 2, 3]);
    // prompts/negatives/quotes populated without workflow hydration
    expect(result.chats[0].images[0].prompt).toBe("prompt-1-1");
    expect(result.chats[0].images[0].negativePrompt).toBe("negative-1");
    expect(result.chats[0].images[0].quote).toBe("quote-1");
    // image attributes present
    expect(result.chats[0].images[0].imageUrl).toContain("/api/v1/image-gen/results/");
    expect(result.chats[0].images[0].chatId).toBe("1");
    expect(result.chats[0].images[0].messageId).toBe("msg-1");
    // ensure workflow not hydrated and not exposed
    const exposed = JSON.stringify(result);
    expect(exposed).not.toContain("__inlayIllustratorWorkflowRef");
    expect(exposed).not.toContain("imageParameters");
    expect(exposed).not.toContain("rawJson");
    expect(exposed).not.toContain("workflow");
    // Ensure we did not read workflow file
    expect(storage.readCalls.some((c) => c.path.includes("workflows"))).toBe(false);
  });

  test(">5 chats paginates 5 per page", async () => {
    for (let i = 1; i <= 7; i += 1) {
      const chatId = String(i);
      const rec = makeRecord(chatId, `msg-${i}`, 0, [1]);
      storage.seedState(chatId, "user-1", { characterAppearance: {}, generated: { k1: rec } });
    }
    const p1 = await listInlayGallery("user-1", 1);
    expect(p1.totalChats).toBe(7);
    expect(p1.totalPages).toBe(2);
    expect(p1.page).toBe(1);
    expect(p1.chatIds).toEqual(["1","2","3","4","5","6","7"]);
    expect(p1.chats.map((c) => c.chatId)).toEqual(["1","2","3","4","5"]);
    const p2 = await listInlayGallery("user-1", 2);
    expect(p2.chats.map((c) => c.chatId)).toEqual(["6","7"]);
    const pClamped = await listInlayGallery("user-1", 99);
    expect(pClamped.page).toBe(2);
    expect(pClamped.chats.map((c) => c.chatId)).toEqual(["6","7"]);
    const pLow = await listInlayGallery("user-1", 0);
    expect(pLow.page).toBe(1);
  });

  test("ordering numeric ascending else lexicographic", async () => {
    const ids = ["10","2","1","chat-b","chat-a"];
    for (const cid of ids) {
      const rec = makeRecord(cid, `msg-${cid}`, 0, [1]);
      storage.seedState(cid, "user-1", { characterAppearance: {}, generated: { k: rec } });
    }
    const result = await listInlayGallery("user-1", 1);
    expect(result.chatIds).toEqual(["1","2","10","chat-a","chat-b"]);
  });

  test("selectedChatId returns only that chat and still provides nav", async () => {
    for (let i = 1; i <= 3; i += 1) {
      const rec = makeRecord(String(i), `msg-${i}`, 0, [1]);
      storage.seedState(String(i), "user-1", { characterAppearance: {}, generated: { k: rec } });
    }
    const result = await listInlayGallery("user-1", 2, "2");
    expect(result.totalChats).toBe(3);
    expect(result.totalPages).toBe(1);
    expect(result.chatIds).toEqual(["1","2","3"]);
    expect(result.chats.length).toBe(1);
    expect(result.chats[0].chatId).toBe("2");
    expect(result.page).toBe(1); // selected uses clamped page but should still be valid? spec says page metadata still provided
  });

  test("skip corrupt/missing records without failing whole gallery", async () => {
    const good = makeRecord("1", "msg-good", 0, [1]);
    const corrupt = { not: "a record" };
    // Seed missing reference path that does not exist
    const missingRef: GeneratedRecordReference = {
      storageVersion: 2,
      recordPath: "records/1/missing.json",
      chatId: "1",
      messageId: "missing",
      swipeId: 0,
      paragraphs: [1],
      imageIds: ["x"],
      imageUrls: ["/api/v1/image-gen/results/x"],
      createdAt: new Date().toISOString()
    };
    storage.seedState("1", "user-1", { characterAppearance: {}, generated: { good, bad: corrupt, missing: missingRef } });
    // Also add another chat good
    const rec2 = makeRecord("2", "msg-2", 0, [1]);
    storage.seedState("2", "user-1", { characterAppearance: {}, generated: { k: rec2 } });

    const result = await listInlayGallery("user-1", 1);
    expect(result.totalChats).toBe(2);
    // chat 1 should have only good image
    const chat1 = result.chats.find((c) => c.chatId === "1");
    expect(chat1).toBeDefined();
    expect(chat1!.images.length).toBe(1);
    expect(chat1!.images[0].messageId).toBe("msg-good");
  });

  test("deduplicate same record key/reference", async () => {
    const rec = makeRecord("1", "msg-dup", 0, [1]);
    const path = "records/1/dup.json";
    storage.files.set(JSON.stringify(["user-1", path]), JSON.stringify(rec));
    const ref1: GeneratedRecordReference = makeReference(rec, path);
    const ref2: GeneratedRecordReference = makeReference(rec, path);
    storage.seedState("1", "user-1", { characterAppearance: {}, generated: { k1: ref1, k2: ref2 } });
    const result = await listInlayGallery("user-1", 1);
    expect(result.chats[0].images.length).toBe(1);
  });

  test("does not enumerate unrelated storage", async () => {
    const rec = makeRecord("1", "msg-1", 0, [1]);
    storage.seedState("1", "user-1", { characterAppearance: {}, generated: { k: rec } });
    // Add unrelated file
    storage.files.set(JSON.stringify(["user-1", "config.json"]), JSON.stringify({}));
    storage.files.set(JSON.stringify(["user-1", "workflows/hash.json"]), JSON.stringify({}));
    storage.files.set(JSON.stringify(["user-1", "records/1/other.json"]), JSON.stringify(rec));
    const result = await listInlayGallery("user-1", 1);
    expect(storage.listCalls[0].prefix).toBe("states/");
    expect(result.chats[0].images.length).toBe(1);
  });

  test("no workflow hydration even when reference contains workflow ref", async () => {
    const rec = makeRecord("1", "msg-wf", 0, [1]);
    (rec as unknown as { imageParameters?: unknown }).imageParameters = [{ workflow: { __inlayIllustratorWorkflowRef: "abc" } }];
    const path = "records/1/wf.json";
    storage.files.set(JSON.stringify(["user-1", path]), JSON.stringify(rec));
    storage.seedWorkflow("abc", { fake: "workflow" }, "user-1");
    const ref = makeReference(rec, path);
    storage.seedState("1", "user-1", { characterAppearance: {}, generated: { k: ref } });
    const result = await listInlayGallery("user-1", 1);
    expect(result.chats[0].images[0].prompt).toBeDefined();
    expect(storage.readCalls.some((c) => c.path.includes("workflows/abc.json"))).toBe(false);
    expect(JSON.stringify(result)).not.toContain("fake");
  });
});

test("gallery lists chats when host list returns prefix-relative paths", async () => {
  // Real Lumiverse host: userStorage.list("states/") returns entries relative to the
  // prefix directory ("<chatId>.json"), not full "states/<chatId>.json" paths.
  const chatId = "rel-chat-1";
  const record = makeRecord(chatId, "msg-rel-1", 0, [1]);
  storage.seedState(chatId, "user-1", {
    characterAppearance: {},
    generated: { key1: makeReference(record, `records/${chatId}/key1.json`) }
  });
  storage.seedRecord(chatId, "key1", record, "user-1");
  const originalList = storage.list.bind(storage);
  (storage as unknown as { list: (prefix?: string, userId?: string) => Promise<string[]> }).list =
    async (prefix, userId) => {
      const full = await originalList(prefix, userId);
      return full.map((p) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p));
    };
  try {
    const result = await listInlayGallery("user-1", 1);
    expect(result.chatIds).toEqual([chatId]);
    expect(result.chats.length).toBe(1);
    expect(result.chats[0].images.length).toBe(1);
    expect(result.chats[0].images[0].imageId).toBe(record.imageIds[0]);
  } finally {
    (storage as unknown as { list: (prefix?: string, userId?: string) => Promise<string[]> }).list = originalList;
  }
});


describe("inlay gallery chat enrichment", () => {
  test("names entries with the card/chat name and reports message/branch counts", async () => {
    // Host chat/character APIs resolve display metadata for each gallery chat.
    const chats = new Map<string, { name: string; character_id: string }>([
      ["1", { name: "Alice chat", character_id: "char-1" }],
      ["2", { name: "Bob chat", character_id: "char-2" }]
    ]);
    const characters = new Map<string, { name: string }>([
      ["char-1", { name: "Alice" }],
      ["char-2", { name: "Bob" }]
    ]);
    const baseSpindle = (globalThis as unknown as { spindle: Record<string, unknown> }).spindle;
    (globalThis as unknown as { spindle: unknown }).spindle = {
      ...baseSpindle,
      chats: { get: async (id: string) => chats.get(id) || null },
      characters: { get: async (id: string) => characters.get(id) || null }
    };

    // Chat 1: two messages, one of which has a non-default swipe branch.
    const recordA = makeRecord("1", "msg-1", 0, [1, 2]);
    const recordB = makeRecord("1", "msg-1", 1, [1]); // branch swipe
    const recordC = makeRecord("1", "msg-2", 0, [1]);
    for (const [key, rec] of [["a", recordA], ["b", recordB], ["c", recordC]] as const) {
      const recordPath = `records/1/${key}.json`;
      storage.seedRecord("1", key, rec);
      storage.files.set(JSON.stringify(["user-1", recordPath]), JSON.stringify(rec));
    }
    storage.seedState("1", "user-1", {
      characterAppearance: {},
      generated: { a: makeReference(recordA, "records/1/a.json"), b: makeReference(recordB, "records/1/b.json"), c: makeReference(recordC, "records/1/c.json") }
    });

    // Chat 2: a single message.
    const recordD = makeRecord("2", "msg-x", 0, [1]);
    const recordPathD = "records/2/d.json";
    storage.seedRecord("2", "d", recordD);
    storage.files.set(JSON.stringify(["user-1", recordPathD]), JSON.stringify(recordD));
    storage.seedState("2", "user-1", { characterAppearance: {}, generated: { d: makeReference(recordD, recordPathD) } });

    const result = await listInlayGallery("user-1", 1);
    const chat1 = result.chats.find((c) => c.chatId === "1");
    const chat2 = result.chats.find((c) => c.chatId === "2");

    expect(chat1?.cardName).toBe("Alice");
    expect(chat1?.name).toBe("Alice chat");
    expect(chat1?.messageCount).toBe(2); // msg-1, msg-2
    expect(chat1?.branchCount).toBe(1); // msg-1 swipe 1
    expect(chat1?.images.length).toBe(4); // recordA(2) + recordB(1) + recordC(1)

    expect(chat2?.cardName).toBe("Bob");
    expect(chat2?.name).toBe("Bob chat");
    expect(chat2?.messageCount).toBe(1);
    expect(chat2?.branchCount).toBe(0);
    expect(chat2?.images.length).toBe(1);
  });

  test("falls back to raw chat ids when the host chat API is unavailable", async () => {
    // Simulate a host without chats/characters APIs (older host or limited permissions).
    const spindle = (globalThis as unknown as { spindle: unknown }).spindle as Record<string, unknown>;
    delete spindle.chats;
    delete spindle.characters;

    const record = makeRecord("7", "msg-7", 0, [1]);
    const recordPath = "records/7/seven.json";
    storage.seedRecord("7", "seven", record);
    storage.files.set(JSON.stringify(["user-1", recordPath]), JSON.stringify(record));
    storage.seedState("7", "user-1", { characterAppearance: {}, generated: { seven: makeReference(record, recordPath) } });

    const result = await listInlayGallery("user-1", 1);
    const chat = result.chats.find((c) => c.chatId === "7");
    expect(chat?.cardName).toBeUndefined();
    expect(chat?.name).toBeUndefined();
    expect(chat?.messageCount).toBe(1);
    expect(chat?.branchCount).toBe(0);
  });
});
