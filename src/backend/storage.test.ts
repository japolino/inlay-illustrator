import { beforeEach, describe, expect, test } from "bun:test";
import type { Config } from "../shared/config.js";
import {
  compactWorkflowParameters,
  getConfig,
  hydrateWorkflowParameters,
  readJson,
  setConfig,
  updateJson
} from "./storage.js";

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

type Doc = { items: Record<string, string> };

function emptyDoc(): Doc {
  return { items: {} };
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

  seed(path: string, userId: string | undefined, value: unknown): void {
    this.files.set(this.key(path, userId), JSON.stringify(value));
  }

  seedRaw(path: string, userId: string | undefined, contents: string): void {
    this.files.set(this.key(path, userId), contents);
  }

  storedConfig(userId?: string): Config {
    const contents = this.files.get(this.key("config.json", userId));
    if (contents === undefined) throw new Error(`No config stored for ${userId || "default"}.`);
    return JSON.parse(contents) as Config;
  }

  stored<T>(path: string, userId?: string): T {
    const contents = this.files.get(this.key(path, userId));
    if (contents === undefined) throw new Error(`No file stored for ${userId || "default"}/${path}.`);
    return JSON.parse(contents) as T;
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

const A = "chats/chat-1/doc.json";
const B = "chats/chat-2/doc.json";
const update = (path: string, userId: string, mutate: (doc: Doc) => void) => updateJson<Doc>(path, emptyDoc, mutate, userId);

describe("serialized JSON updates", () => {
  test("queues overlapping updates of one file and applies each to fresh data", async () => {
    storage.seed(A, "user-1", emptyDoc());
    const firstWrite = storage.gateNextWrite();
    const first = update(A, "user-1", (doc) => { doc.items.a = "1"; });
    await firstWrite.entered.promise;
    const second = update(A, "user-1", (doc) => { doc.items.b = "2"; });
    const third = update(A, "user-1", (doc) => { doc.items.c = "3"; });
    await flushAsyncWork();
    expect(storage.readCalls).toHaveLength(1);
    expect(storage.writeCalls).toHaveLength(1);
    firstWrite.release.resolve(undefined);
    await Promise.all([first, second, third]);
    expect(storage.stored<Doc>(A, "user-1")).toEqual({ items: { a: "1", b: "2", c: "3" } });
    expect(storage.writeCalls).toHaveLength(3);
  });

  test("does not block a different file or user behind a held update", async () => {
    const heldWrite = storage.gateNextWrite();
    const held = update(A, "user-1", (doc) => { doc.items.held = "1"; });
    await heldWrite.entered.promise;
    let otherFile = false;
    let otherUser = false;
    const p1 = update(B, "user-1", (doc) => { doc.items.other = "1"; }).then(() => { otherFile = true; });
    const p2 = update(A, "user-2", (doc) => { doc.items.other = "2"; }).then(() => { otherUser = true; });
    await flushAsyncWork();
    expect(otherFile).toBe(true);
    expect(otherUser).toBe(true);
    heldWrite.release.resolve(undefined);
    await Promise.all([held, p1, p2]);
  });

  test("propagates a read failure without writing a fallback", async () => {
    storage.seed(A, "user-1", { items: { keep: "1" } });
    storage.failNextRead = new Error("read failed");
    await expect(update(A, "user-1", (doc) => { doc.items.x = "1"; })).rejects.toThrow("read failed");
    expect(storage.writeCalls).toHaveLength(0);
    expect(storage.stored<Doc>(A, "user-1")).toEqual({ items: { keep: "1" } });
  });

  test("rejects malformed stored JSON without replacing it", async () => {
    storage.seedRaw(A, "user-1", "{not valid JSON");
    await expect(update(A, "user-1", (doc) => { doc.items.x = "1"; })).rejects.toBeInstanceOf(SyntaxError);
    expect(storage.writeCalls).toHaveLength(0);
  });

  test("continues the queue after a write failure or a throwing mutator", async () => {
    storage.failNextWrite = new Error("write failed");
    const failedWrite = update(A, "user-1", (doc) => { doc.items.a = "1"; });
    const failure = new Error("mutation rejected");
    const failedMutation = update(A, "user-1", () => { throw failure; }).then(() => null, (error: unknown) => error);
    const recovered = update(A, "user-1", (doc) => { doc.items.b = "2"; });
    await expect(failedWrite).rejects.toThrow("write failed");
    expect(await failedMutation).toBe(failure);
    await expect(recovered).resolves.toEqual({ items: { b: "2" } });
    expect(storage.writeCalls).toHaveLength(2);
  });

  test("lenient reads fall back on failure", async () => {
    storage.seedRaw(A, "user-1", "{broken");
    await expect(readJson<Doc>(A, emptyDoc(), "user-1")).resolves.toEqual({ items: {} });
  });
});

describe("serialized configuration updates", () => {
  test("keeps display reads lenient but rejects updates after a storage read failure", async () => {
    storage.seed("config.json", "user-1", { fabCorner: "top-left" });
    storage.failNextRead = new Error("config read failed");
    await expect(getConfig("user-1")).resolves.toMatchObject({ fabCorner: "bottom-right" });
    storage.failNextRead = new Error("config read failed");
    await expect(setConfig({ fabCorner: "top-right" }, "user-1")).rejects.toThrow("config read failed");
    expect(storage.storedConfig("user-1").fabCorner).toBe("top-left");
    expect(storage.writeCalls).toHaveLength(0);
  });

  test("keeps the latest value when rapid field changes overlap", async () => {
    const firstWrite = storage.gateNextWrite();
    const first = setConfig({ parserModel: "a" }, "user-1");
    await firstWrite.entered.promise;
    const second = setConfig({ parserModel: "ab" }, "user-1");
    await flushAsyncWork();
    expect(storage.writeCalls).toHaveLength(1);
    firstWrite.release.resolve(undefined);
    await Promise.all([first, second]);
    expect(storage.storedConfig("user-1").parserModel).toBe("ab");
    expect(storage.writeCalls).toHaveLength(2);
  });
});

describe("workflow dedupe", () => {
  const parameters = () => ({ seed: 42, workflow: { "1": { class_type: "Text", inputs: { text: "prompt" } } } });

  test("stores one deduplicated workflow and hydrates exact parameters", async () => {
    const first = await compactWorkflowParameters(parameters(), "user-1");
    const second = await compactWorkflowParameters(parameters(), "user-1");
    expect(first).toEqual(second);
    expect([...storage.files.keys()].filter((key) => key.includes("workflows/"))).toHaveLength(1);
    expect(await compactWorkflowParameters(first, "user-1")).toBe(first);
    expect(await hydrateWorkflowParameters(first, "user-1")).toEqual(parameters());
  });

  test("distinguishes missing and corrupt stored workflows", async () => {
    const compact = await compactWorkflowParameters({ workflow: { probe: { class_type: "Probe", inputs: {} } } }, "user-1");
    const key = [...storage.files.keys()].find((entry) => entry.includes("workflows/"))!;
    const saved = storage.files.get(key)!;
    storage.files.delete(key);
    await expect(hydrateWorkflowParameters(compact, "user-1")).rejects.toThrow(/Stored ComfyUI workflow .* is unavailable/);
    storage.files.set(key, "{not valid json");
    await expect(hydrateWorkflowParameters(compact, "user-1")).rejects.toBeInstanceOf(SyntaxError);
    storage.files.set(key, saved);
  });
});
