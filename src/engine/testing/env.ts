/**
 * Seeded clock/RNG for parity tests. The same source is installed into the ORIGINAL bundle's process
 * (fixture generators patch the globals with `installGlobalEnv`) and into the port (`setEngineEnv`),
 * so both sides consume identical random sequences.
 */
import type { EngineEnvSource } from "../core/env";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic env: fixed clock that advances 1 ms per read, seeded PRNG for everything random. */
export function seededEnv(seed = 1, startMs = 1_760_000_000_000): EngineEnvSource {
  const rand = mulberry32(seed);
  let now = startMs;
  let perf = 0;
  let uuid = 0;
  return {
    now: () => now++,
    random: () => rand(),
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (array) {
        const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(rand() * 256);
      }
      return array;
    },
    randomUUID: () => `00000000-0000-4000-8000-${(uuid++).toString(16).padStart(12, "0")}`,
    performanceNow: () => (perf += 1),
  };
}

/**
 * Patch the real globals (Math.random, Date.now, crypto.getRandomValues, crypto.randomUUID,
 * performance.now) with `source`. Used by fixture generators that run the ORIGINAL bundle.
 * Returns a restore function.
 */
export function installGlobalEnv(source: EngineEnvSource): () => void {
  const saved = {
    random: Math.random,
    now: Date.now,
    grv: globalThis.crypto.getRandomValues,
    uuid: globalThis.crypto.randomUUID,
    perf: globalThis.performance.now,
  };
  Math.random = source.random;
  Date.now = source.now;
  Object.defineProperty(globalThis.crypto, "getRandomValues", { value: source.getRandomValues, configurable: true, writable: true });
  Object.defineProperty(globalThis.crypto, "randomUUID", { value: source.randomUUID, configurable: true, writable: true });
  Object.defineProperty(globalThis.performance, "now", { value: source.performanceNow, configurable: true, writable: true });
  return () => {
    Math.random = saved.random;
    Date.now = saved.now;
    Object.defineProperty(globalThis.crypto, "getRandomValues", { value: saved.grv, configurable: true, writable: true });
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: saved.uuid, configurable: true, writable: true });
    Object.defineProperty(globalThis.performance, "now", { value: saved.perf, configurable: true, writable: true });
  };
}
