import { describe, expect, test } from "bun:test";
import { GenerationOperationQueue, throwIfAborted } from "./operation-manager.js";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("generation operation queue", () => {
  test("runs one chat in FIFO order while another chat progresses independently", async () => {
    const queue = new GenerationOperationQueue();
    const firstGate = deferred();
    const events: string[] = [];
    const first = queue.enqueue("user", "chat-a", "message-1", async () => {
      events.push("a1-start");
      await firstGate.promise;
      events.push("a1-end");
    });
    const second = queue.enqueue("user", "chat-a", "message-2", async () => {
      events.push("a2-start");
    });
    const other = queue.enqueue("user", "chat-b", "message-1", async () => {
      events.push("b1-start");
    });

    await flush();
    expect(events).toEqual(["a1-start", "b1-start"]);
    firstGate.resolve();
    await Promise.all([first.promise, second.promise, other.promise]);
    expect(events).toEqual(["a1-start", "b1-start", "a1-end", "a2-start"]);
  });

  test("deduplicates a message and cooperatively aborts queued work", async () => {
    const queue = new GenerationOperationQueue();
    const firstGate = deferred();
    const first = queue.enqueue("user", "chat", "message-1", async () => firstGate.promise);
    const duplicate = queue.enqueue("user", "chat", "message-1", async () => {
      throw new Error("duplicate task should not run");
    });
    let queuedWasAborted = false;
    const queued = queue.enqueue("user", "chat", "message-2", async (operation) => {
      queuedWasAborted = operation.controller.signal.aborted;
      throwIfAborted(operation.controller.signal);
    });

    expect(duplicate.reused).toBe(true);
    expect(duplicate.promise).toBe(first.promise);
    expect(queue.cancelChat("user", "chat", queued.operation.id)).toEqual([queued.operation.id]);
    firstGate.resolve();
    await first.promise;
    await expect(queued.promise).rejects.toHaveProperty("name", "AbortError");
    expect(queuedWasAborted).toBe(true);
  });
});
