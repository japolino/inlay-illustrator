/** Small helpers shared by the backend services (no host access). */

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  const message = asRecord(error).message;
  return typeof message === "string" ? message : String(error ?? "Unknown error");
}

export function abortError(reason?: unknown): DOMException {
  return new DOMException(typeof reason === "string" && reason ? reason : "The operation was aborted.", "AbortError");
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal.reason);
}

/** Sleep that rejects with an AbortError when the signal fires. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal.reason));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal?.reason));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Race a promise against an AbortSignal (the promise keeps running; its result is discarded on abort). */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(abortError(signal.reason));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** Per-key FIFO: each task starts after the previous task of the same key settled. */
export class KeyedQueue {
  private readonly tails = new Map<string, Promise<void>>();
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const operation = previous.then(task);
    const tail = operation.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return operation;
  }
  get size(): number {
    return this.tails.size;
  }
}

/** Small TTL cache (entries expire after `ttlMs`; LRU-ish cap). */
export class TtlCache<V> {
  private readonly map = new Map<string, { at: number; value: V }>();
  constructor(
    private readonly ttlMs: number,
    private readonly max = 128,
    private readonly now: () => number = Date.now,
  ) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: V): V {
    if (this.map.size >= this.max && !this.map.has(key)) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { at: this.now(), value });
    return value;
  }
  delete(key: string): void {
    this.map.delete(key);
  }
  /** Delete every key that starts with `prefix` (all keys when omitted). */
  clear(prefix?: string): void {
    if (prefix === undefined) this.map.clear();
    else for (const key of [...this.map.keys()]) if (key.startsWith(prefix)) this.map.delete(key);
  }
}

/** Deep merge of a JSON patch into a value (plain objects merge, everything else replaces; `undefined` is skipped). */
export function deepMergePatch<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (!patch || typeof patch !== "object" || Array.isArray(patch) || !base || typeof base !== "object" || Array.isArray(base)) return patch as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype" || value === undefined) continue;
    out[key] = deepMergePatch(out[key], value);
  }
  return out as T;
}

export function jsonClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
