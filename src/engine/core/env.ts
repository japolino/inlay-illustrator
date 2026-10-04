/**
 * Injectable clock / randomness for the Asset Maid core.
 *
 * The generated core (asset-maid-core.ts) never touches `Date.now`, `Math.random`,
 * `crypto` or `performance` directly: the slicer rewrites those accesses to `amEnv.*`.
 * By default they delegate to the real globals, so behaviour equals the original bundle.
 * Tests and callers that need determinism install their own source with `setEngineEnv`
 * or scope it with `withEngineEnv`.
 */
export interface EngineEnvSource {
  /** Milliseconds since epoch (replaces Date.now). */
  now(): number;
  /** Uniform [0, 1) (replaces Math.random). */
  random(): number;
  /** Fills an integer typed array (replaces crypto.getRandomValues). */
  getRandomValues<T extends ArrayBufferView | null>(array: T): T;
  /** RFC 4122 v4 id (replaces crypto.randomUUID). */
  randomUUID(): string;
  /** High-resolution timer (replaces performance.now). */
  performanceNow(): number;
}

const realCrypto: Crypto = globalThis.crypto;

export const defaultEngineEnv: EngineEnvSource = Object.freeze({
  now: () => Date.now(),
  random: () => Math.random(),
  getRandomValues: <T extends ArrayBufferView | null>(array: T): T => realCrypto.getRandomValues(array as never) as T,
  randomUUID: () => realCrypto.randomUUID(),
  performanceNow: () => globalThis.performance?.now?.() ?? Date.now(),
});

let current: EngineEnvSource = defaultEngineEnv;

/** Replace the env source globally. Pass `null` to restore the defaults. Returns the previous source. */
export function setEngineEnv(source: Partial<EngineEnvSource> | null): EngineEnvSource {
  const previous = current;
  current = source ? { ...defaultEngineEnv, ...source } : defaultEngineEnv;
  return previous;
}

/** Run `fn` with a temporary env source (synchronous or async). */
export async function withEngineEnv<T>(source: Partial<EngineEnvSource>, fn: () => T | Promise<T>): Promise<T> {
  const previous = setEngineEnv(source);
  try {
    return await fn();
  } finally {
    current = previous;
  }
}

export function getEngineEnv(): EngineEnvSource {
  return current;
}

/** Shape used by the generated core. All members delegate to the current source at call time. */
export const amEnv = Object.freeze({
  now: (): number => current.now(),
  random: (): number => current.random(),
  crypto: Object.freeze({
    getRandomValues: <T extends ArrayBufferView | null>(array: T): T => current.getRandomValues(array),
    randomUUID: (): string => current.randomUUID(),
    get subtle(): SubtleCrypto {
      return realCrypto.subtle;
    },
  }),
  performance: Object.freeze({
    now: (): number => current.performanceNow(),
  }),
});
