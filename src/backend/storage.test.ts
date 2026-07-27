import { beforeEach, describe, expect, test } from "bun:test";
import type { Config } from "../shared/config.js";
import { updateCache, upsertCharacterTag } from "./memory.js";
import {
  isGeneratedRecordReference,
  loadGeneratedRecord,
  migrateLegacyGeneratedRecords,
  rebuildGeneratedImageIndex,
  setConfig,
  storeGeneratedRecord,
  updateState
} from "./storage.js";
import type { GeneratedRecord, State } from "./types.js";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type WriteGate = {
  entered: Deferred<void>;
  release: Deferred<void>;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function emptyState(): State {
  return { characterAppearance: {}, generated: {} };
}

class MemoryUserStorage {
  readonly files = new Map<string, string>();
  readonly readCalls: Array<{ path: string; userId?: string }> = [];
  readonly writeCalls: Array<{ path: string; userId?: string; data: string }> = [];
  failNextRead: Error | null = null;
  failNextWrite: Error | null = null;
  private readonly writeGates: WriteGate[] = [];

  private key(path: string, userId?: string): string {
    return JSON.stringify([userId ?? null, path]);
  }

  seedState(chatId: string, userId: string | undefined, state: State): void {
    this.files.set(this.key(`states/${chatId}.json`, userId), JSON.stringify(state));
  }

  seedRawState(chatId: string, userId: string | undefined, contents: string): void {
    this.files.set(this.key(`states/${chatId}.json`, userId), contents);
  }

  storedConfig(userId?: string): Config {
    const contents = this.files.get(this.key("config.json", userId));
    if (contents === undefined) throw new Error(`No config stored for ${userId || "default"}.`);
    return JSON.parse(contents) as Config;
  }

  storedState(chatId: string, userId?: string): State {
    const contents = this.files.get(this.key(`states/${chatId}.json`, userId));
    if (contents === undefined) throw new Error(`No state stored for ${userId || "default"}/${chatId}.`);
    return JSON.parse(contents) as State;
  }

  gateNextWrite(): WriteGate {
    const gate = { entered: deferred<void>(), release: deferred<void>() };
    this.writeGates.push(gate);
    return gate;
  }

  async exists(path: string, userId?: string): Promise<boolean> {
    return this.files.has(this.key(path, userId));
  }

  async read(path: string, userId?: string): Promise<string> {
    this.readCalls.push({ path, userId });
    if (this.failNextRead) {
      const error = this.failNextRead;
      this.failNextRead = null;
      throw error;
    }
    const contents = this.files.get(this.key(path, userId));
    if (contents === undefined) throw new Error(`Missing test storage file: ${path}`);
    return contents;
  }

  async mkdir(): Promise<void> {
    return undefined;
  }

  async write(path: string, data: string, userId?: string): Promise<void> {
    this.writeCalls.push({ path, userId, data });
    const gate = this.writeGates.shift();
    if (gate) {
      gate.entered.resolve(undefined);
      await gate.release.promise;
    }
    if (this.failNextWrite) {
      const error = this.failNextWrite;
      this.failNextWrite = null;
      throw error;
    }
    this.files.set(this.key(path, userId), data);
  }
}

let storage: MemoryUserStorage;

beforeEach(() => {
  storage = new MemoryUserStorage();
  (globalThis as typeof globalThis & { spindle: unknown }).spindle = {
    userStorage: {
      exists: (path: string, userId?: string) => storage.exists(path, userId),
      read: (path: string, userId?: string) => storage.read(path, userId),
      mkdir: () => storage.mkdir(),
      write: (path: string, data: string, userId?: string) => storage.write(path, data, userId)
    }
  };
});

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("serialized state updates", () => {
  test("merges overlapping manual saves, automatic memory, and generated records into fresh state", async () => {
    storage.seedState("chat-1", "user-1", emptyState());
    const firstWrite = storage.gateNextWrite();

    const manualSave = updateState("chat-1", "user-1", (state) => {
      upsertCharacterTag(state, "", "Alice", "red hair, standing");
    });
    await firstWrite.entered.promise;

    const secondManualSave = updateState("chat-1", "user-1", (state) => {
      upsertCharacterTag(state, "", "Clara", "green eyes");
    });
    const automaticMemory = updateState("chat-1", "user-1", (state) => {
      updateCache(state.characterAppearance, {
        scenes: [{ shots: [{ paragraph: 1, characters: [{ name: "Bob", appearance: "black hair, portrait" }] }] }]
      });
    });
    const generatedRecord = updateState("chat-1", "user-1", (state) => {
      state.generated["chat-1:message-1:0"] = { imageIds: ["image-1"] };
    });

    await flushAsyncWork();
    expect(storage.readCalls).toHaveLength(1);
    expect(storage.writeCalls).toHaveLength(1);

    firstWrite.release.resolve(undefined);
    await Promise.all([manualSave, secondManualSave, automaticMemory, generatedRecord]);

    expect(storage.storedState("chat-1", "user-1")).toEqual({
      characterAppearance: { Alice: "red hair", Clara: "green eyes", Bob: "black hair" },
      manualCharacterAppearance: { Alice: "red hair", Clara: "green eyes" },
      generated: { "chat-1:message-1:0": { imageIds: ["image-1"] } }
    });
    expect(storage.readCalls).toHaveLength(4);
    expect(storage.writeCalls).toHaveLength(4);
  });

  test("does not block a different chat or user behind a held update", async () => {
    storage.seedState("chat-1", "user-1", emptyState());
    storage.seedState("chat-2", "user-1", emptyState());
    storage.seedState("chat-1", "user-2", emptyState());
    const heldWrite = storage.gateNextWrite();

    const held = updateState("chat-1", "user-1", (state) => {
      state.characterAppearance.Held = "red hair";
    });
    await heldWrite.entered.promise;

    let otherChatFinished = false;
    let otherUserFinished = false;
    const otherChat = updateState("chat-2", "user-1", (state) => {
      state.characterAppearance.OtherChat = "blue hair";
    }).then((state) => {
      otherChatFinished = true;
      return state;
    });
    const otherUser = updateState("chat-1", "user-2", (state) => {
      state.characterAppearance.OtherUser = "green hair";
    }).then((state) => {
      otherUserFinished = true;
      return state;
    });

    await flushAsyncWork();
    expect(otherChatFinished).toBe(true);
    expect(otherUserFinished).toBe(true);
    expect(storage.storedState("chat-2", "user-1").characterAppearance).toEqual({ OtherChat: "blue hair" });
    expect(storage.storedState("chat-1", "user-2").characterAppearance).toEqual({ OtherUser: "green hair" });

    heldWrite.release.resolve(undefined);
    await Promise.all([held, otherChat, otherUser]);
  });

  test("rejects a case-insensitive add collision against the latest committed state", async () => {
    storage.seedState("chat-1", "user-1", emptyState());
    const firstWrite = storage.gateNextWrite();

    const first = updateState("chat-1", "user-1", (state) => {
      upsertCharacterTag(state, "", "Alice", "red hair");
    });
    await firstWrite.entered.promise;
    const colliding = updateState("chat-1", "user-1", (state) => {
      upsertCharacterTag(state, "", "alice", "blue hair");
    });
    const collisionResult = colliding.then(
      () => null,
      (error: unknown) => error
    );

    firstWrite.release.resolve(undefined);
    await expect(first).resolves.toMatchObject({ characterAppearance: { Alice: "red hair" } });
    const collisionError = await collisionResult;
    expect(collisionError).toBeInstanceOf(Error);
    expect((collisionError as Error).message).toBe('A character named "alice" already exists.');
    expect(storage.storedState("chat-1", "user-1").characterAppearance).toEqual({ Alice: "red hair" });
    expect(storage.writeCalls).toHaveLength(1);
  });

  test("propagates a state read failure without writing a fallback state", async () => {
    const original = { characterAppearance: { Alice: "red hair" }, generated: { existing: { imageIds: ["old"] } } };
    storage.seedState("chat-1", "user-1", original);
    storage.failNextRead = new Error("state read failed");

    const update = updateState("chat-1", "user-1", (state) => {
      state.characterAppearance.Bob = "black hair";
    });

    await expect(update).rejects.toThrow("state read failed");
    expect(storage.writeCalls).toHaveLength(0);
    expect(storage.storedState("chat-1", "user-1")).toEqual(original);
  });

  test("rejects malformed stored state without replacing it", async () => {
    storage.seedRawState("chat-1", "user-1", "{not valid JSON");

    const update = updateState("chat-1", "user-1", (state) => {
      state.characterAppearance.Bob = "black hair";
    });

    await expect(update).rejects.toBeInstanceOf(SyntaxError);
    expect(storage.writeCalls).toHaveLength(0);
    expect(storage.files.values().next().value).toBe("{not valid JSON");
  });

  test("continues a same-scope queue after a write failure", async () => {
    storage.seedState("chat-1", "user-1", emptyState());
    storage.failNextWrite = new Error("state write failed");

    const failed = updateState("chat-1", "user-1", (state) => {
      state.characterAppearance.Alice = "red hair";
    });
    const recovered = updateState("chat-1", "user-1", (state) => {
      state.characterAppearance.Bob = "black hair";
    });

    await expect(failed).rejects.toThrow("state write failed");
    await expect(recovered).resolves.toMatchObject({ characterAppearance: { Bob: "black hair" } });
    expect(storage.storedState("chat-1", "user-1").characterAppearance).toEqual({ Bob: "black hair" });
    expect(storage.writeCalls).toHaveLength(2);
  });

  test("does not write a throwing mutator and still runs the next queued mutation", async () => {
    storage.seedState("chat-1", "user-1", emptyState());
    const failure = new Error("mutation rejected");

    const failed = updateState("chat-1", "user-1", (state) => {
      state.characterAppearance.Alice = "red hair";
      throw failure;
    });
    const recovered = updateState("chat-1", "user-1", (state) => {
      state.characterAppearance.Bob = "black hair";
    });

    await expect(failed).rejects.toBe(failure);
    await expect(recovered).resolves.toMatchObject({ characterAppearance: { Bob: "black hair" } });
    expect(storage.storedState("chat-1", "user-1").characterAppearance).toEqual({ Bob: "black hair" });
    expect(storage.writeCalls).toHaveLength(1);
  });
});

describe("serialized configuration updates", () => {
  test("keeps the latest value when rapid field changes overlap", async () => {
    const firstWrite = storage.gateNextWrite();
    const first = setConfig({ customParserInstructions: "a" }, "user-1");
    await firstWrite.entered.promise;

    const second = setConfig({ customParserInstructions: "ab" }, "user-1");
    await flushAsyncWork();
    expect(storage.writeCalls).toHaveLength(1);

    firstWrite.release.resolve(undefined);
    await Promise.all([first, second]);

    expect(storage.storedConfig("user-1").customParserInstructions).toBe("ab");
    expect(storage.writeCalls).toHaveLength(2);
  });
});

describe("compact generated-record storage", () => {
  function record(): GeneratedRecord {
    const parameters = {
      seed: 42,
      workflow: { "1": { class_type: "Text", inputs: { text: "prompt" } } }
    };
    return {
      chatId: "chat-1",
      messageId: "message-1",
      swipeId: 0,
      prompts: ["positive", "positive two"],
      negativePrompts: ["negative", "negative two"],
      perspectiveModes: ["dynamic", "static"],
      perspectiveSources: ["manual", "adaptive"],
      imageParameters: [structuredClone(parameters), structuredClone(parameters)],
      paragraphs: [1, 2],
      imageIds: ["image-1", "image-2"],
      imageUrls: ["/one", "/two"],
      rawJson: { scenes: [] },
      createdAt: "2026-07-18T00:00:00.000Z"
    };
  }

  test("stores one deduplicated workflow and hydrates exact reroll parameters", async () => {
    const original = record();
    const reference = await storeGeneratedRecord("chat-1", "chat-1:message-1:0", original, "user-1");
    expect(isGeneratedRecordReference(reference)).toBe(true);
    const workflowFiles = [...storage.files.keys()].filter((key) => key.includes("workflows/"));
    expect(workflowFiles).toHaveLength(1);

    const hydrated = await loadGeneratedRecord(reference, "user-1");
    expect(hydrated?.imageParameters).toEqual(original.imageParameters);
  });

  test("migrates legacy records into compact references and builds direct image indexes", async () => {
    const state: State = { characterAppearance: {}, generated: { legacy: record() } };
    await migrateLegacyGeneratedRecords("chat-1", state, "user-1");
    rebuildGeneratedImageIndex(state);

    expect(isGeneratedRecordReference(state.generated.legacy)).toBe(true);
    expect(state.generatedImageIndex?.["id:image-2"]).toEqual({ key: "legacy", index: 1 });
    expect((state.generated.legacy as Record<string, unknown>).prompts).toBeUndefined();
  });
});
