export type GenerationStage =
  | "queued"
  | "loading"
  | "parsing"
  | "preparing"
  | "generating"
  | "persisting"
  | "completed"
  | "failed"
  | "cancelled";

export type GenerationOperation = {
  id: string;
  userId?: string;
  chatId: string;
  messageId: string;
  controller: AbortController;
  stage: GenerationStage;
  completed: number;
  total: number;
};

type OperationTask = (operation: GenerationOperation) => Promise<void>;

type ScheduledOperation = {
  operation: GenerationOperation;
  promise: Promise<void>;
  reused: boolean;
};

function operationKey(userId: string | undefined, chatId: string, messageId: string): string {
  return JSON.stringify([userId ?? null, chatId, messageId]);
}

function chatKey(userId: string | undefined, chatId: string): string {
  return JSON.stringify([userId ?? null, chatId]);
}

function randomOperationId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `inlay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Runs generations in narrative order inside one chat while allowing unrelated
 * chats to progress independently. Duplicate requests share the same Promise.
 */
export class GenerationOperationQueue {
  private readonly operations = new Map<string, ScheduledOperation>();
  private readonly chatTails = new Map<string, Promise<void>>();

  enqueue(
    userId: string | undefined,
    chatId: string,
    messageId: string,
    task: OperationTask,
    dedupeId = messageId
  ): ScheduledOperation {
    const key = operationKey(userId, chatId, dedupeId);
    const existing = this.operations.get(key);
    if (existing) return { ...existing, reused: true };

    const operation: GenerationOperation = {
      id: randomOperationId(),
      userId,
      chatId,
      messageId,
      controller: new AbortController(),
      stage: "queued",
      completed: 0,
      total: 0
    };
    const queueKey = chatKey(userId, chatId);
    const previous = this.chatTails.get(queueKey) || Promise.resolve();
    const execution = previous.then(() => task(operation), () => task(operation));
    const tail = execution.then(() => undefined, () => undefined);
    const scheduled: ScheduledOperation = { operation, promise: execution, reused: false };
    this.operations.set(key, scheduled);
    this.chatTails.set(queueKey, tail);
    void tail.finally(() => {
      if (this.operations.get(key)?.promise === execution) this.operations.delete(key);
      if (this.chatTails.get(queueKey) === tail) this.chatTails.delete(queueKey);
    });
    return scheduled;
  }

  cancelChat(userId: string | undefined, chatId: string, operationId?: string): string[] {
    const cancelled: string[] = [];
    for (const scheduled of this.operations.values()) {
      const operation = scheduled.operation;
      if (operation.userId !== userId || operation.chatId !== chatId) continue;
      if (operationId && operation.id !== operationId) continue;
      if (!operation.controller.signal.aborted) operation.controller.abort("Cancelled by user");
      cancelled.push(operation.id);
    }
    return cancelled;
  }
}

type GlobalOperationRegistry = { queue: GenerationOperationQueue };
const REGISTRY_KEY = Symbol.for("inlay-illustrator.generation-operations");
const globalRegistry = globalThis as unknown as Record<PropertyKey, unknown>;

function sharedQueue(): GenerationOperationQueue {
  const existing = globalRegistry[REGISTRY_KEY] as GlobalOperationRegistry | undefined;
  if (existing?.queue && typeof existing.queue.enqueue === "function" && typeof existing.queue.cancelChat === "function") {
    return existing.queue;
  }
  const created = { queue: new GenerationOperationQueue() };
  globalRegistry[REGISTRY_KEY] = created;
  return created.queue;
}

export function enqueueGeneration(
  userId: string | undefined,
  chatId: string,
  messageId: string,
  task: OperationTask,
  dedupeId?: string
): ScheduledOperation {
  return sharedQueue().enqueue(userId, chatId, messageId, task, dedupeId);
}

export function cancelChatGenerations(userId: string | undefined, chatId: string, operationId?: string): string[] {
  return sharedQueue().cancelChat(userId, chatId, operationId);
}

export function abortError(message = "Generation cancelled."): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(typeof signal.reason === "string" ? signal.reason : undefined);
}

export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted || (error instanceof Error && error.name === "AbortError"));
}
